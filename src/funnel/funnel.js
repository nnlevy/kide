// Family-play counts. Rows store a step, a UTC day, and the sharer's code.
// They do not store an email, a device id, an IP address, or a user-agent string.
// play_day and gate_day are written by the server while handling the play
// tick the game already sends. This module does not call notifyReferralActivity
// and does not send email. Cash attribution stays on the hub webhook, which
// reads Stripe metadata custom_ref from createCheckout.

import { normalizeRef, refFromRequest } from "../referral/ref.js";
import { checkoutSessionId } from "../unlock/entitlement.js";

export const DOMAIN = "kide.us";

export const SERVER_STEPS = {
  link_open: ["phone", "tablet", "computer"],
  link_preview: ["preview"],
  play_day: [],
  gate_day: [],
  checkout_open: [],
  checkout_fail: [],
  paid: [],
};

export const BROWSER_STEPS = {
  home_cta: [],
  unlock_view: ["gate", "goodnight", "direct"],
  check_pass: [],
  check_fail: [],
  checkout_click: [],
  checkout_back: [],
};

const ALERT_STEPS = new Set(["link_open", "checkout_open"]);
const ALERT_GAP_MS = 10 * 60 * 1000;
const ALERT_DAY_CAP = 20;

export function deviceClass(ua) {
  const s = String(ua || "");
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(s)) return "tablet";
  if (/iPhone|iPod|Android.*Mobile|Mobile/i.test(s)) return "phone";
  return "computer";
}

export function isPreviewFetch(ua) {
  return /facebookexternalhit|Facebot|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Pinterest|SkypeUriPreview|bot\b|crawler|spider|preview/i.test(String(ua || ""));
}

function cleanDetail(map, step, detail) {
  const allowed = map[step];
  if (!allowed) return null;
  return typeof detail === "string" && allowed.includes(detail) ? detail : "";
}

function dbOf(env) {
  return env && env.DB && typeof env.DB.prepare === "function" ? env.DB : null;
}

let ready = false;
async function ensureTables(db) {
  if (ready) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS kide_funnel_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,
      step TEXT NOT NULL,
      ref TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      slot TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS kide_funnel_slot
      ON kide_funnel_events(slot)`,
    `CREATE INDEX IF NOT EXISTS kide_funnel_events_day
      ON kide_funnel_events(day, step, ref)`,
    `CREATE TABLE IF NOT EXISTS kide_funnel_paid (
      source_ref TEXT PRIMARY KEY,
      ref TEXT NOT NULL DEFAULT '',
      paid_at INTEGER NOT NULL,
      refunded_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS kide_funnel_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL,
      step TEXT NOT NULL,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,
      gap_key TEXT NOT NULL UNIQUE,
      day_key TEXT NOT NULL UNIQUE
    )`,
  ];
  for (const sql of stmts) await db.prepare(sql).run();
  ready = true;
}

export function resetForTests() {
  ready = false;
}

function dayOf(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function changesOf(res) {
  return Number(res && res.meta && res.meta.changes) || 0;
}

/**
 * Stores one step. slot, when set, is inserted once: a second writer loses.
 * Returns the row id, or 0 when nothing new was stored.
 */
export async function recordStep(env, { step, ref, detail, now, slot }, steps = SERVER_STEPS) {
  const db = dbOf(env);
  if (!db) return 0;
  const clean = cleanDetail(steps, step, detail);
  if (clean === null) return 0;
  const ts = typeof now === "number" ? now : Date.now();
  const once = typeof slot === "string" && slot ? slot.slice(0, 120) : null;
  try {
    await ensureTables(db);
    const sql = once
      ? `INSERT OR IGNORE INTO kide_funnel_events (ts, day, step, ref, detail, slot)
         VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT INTO kide_funnel_events (ts, day, step, ref, detail, slot)
         VALUES (?, ?, ?, ?, ?, ?)`;
    const res = await db.prepare(sql).bind(
      ts, dayOf(ts), step, normalizeRef(ref) || "", clean, once,
    ).run();
    if (once && changesOf(res) !== 1) return 0;
    return Number(res && res.meta && res.meta.last_row_id) || 0;
  } catch {
    return 0;
  }
}

/**
 * One local alert row per share code per 10-minute window, and at most 20
 * a UTC day. The insert is the delivery record. This does not send email
 * and does not call the hub.
 */
export async function claimAlert(env, { step, ref, now }) {
  const code = normalizeRef(ref);
  const db = dbOf(env);
  if (!code || !ALERT_STEPS.has(step) || !db) return false;
  const ts = typeof now === "number" ? now : Date.now();
  const day = dayOf(ts);
  const gapKey = `${code}:${Math.floor(ts / ALERT_GAP_MS)}`;
  try {
    await ensureTables(db);
    for (let attempt = 0; attempt < 3; attempt++) {
      const today = await db.prepare(
        "SELECT COUNT(*) AS n FROM kide_funnel_alerts WHERE ref = ? AND day = ?",
      ).bind(code, day).first();
      const n = today ? Number(today.n) || 0 : 0;
      if (n >= ALERT_DAY_CAP) return false;
      const dayKey = `${code}:${day}:${n}`;
      try {
        const res = await db.prepare(
          `INSERT INTO kide_funnel_alerts (ref, step, ts, day, gap_key, day_key)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(gap_key) DO NOTHING`,
        ).bind(code, step, ts, day, gapKey, dayKey).run();
        if (changesOf(res) === 1) return true;
      } catch (err) {
        const message = String(err && err.message ? err.message : err);
        if (!/unique|constraint/i.test(message)) return false;
      }
      const held = await db.prepare(
        "SELECT 1 AS n FROM kide_funnel_alerts WHERE gap_key = ?",
      ).bind(gapKey).first();
      if (held) return false;
    }
    return false;
  } catch {
    return false;
  }
}

/** Record paid Checkout sessions once, and mark a session refunded in place. */
export async function reconcilePaid(env, credits, ref, now) {
  const db = dbOf(env);
  if (!db || !credits || credits.ok !== true || !Array.isArray(credits.purchases)) return;
  const ts = typeof now === "number" ? now : Date.now();
  const code = normalizeRef(ref) || "";
  try {
    await ensureTables(db);
    const byId = new Map();
    for (const row of credits.purchases) {
      if (!row || row.domain !== DOMAIN || row.offeringId !== "family_unlock") continue;
      const sourceRef = checkoutSessionId(row.sourceRef);
      if (!sourceRef) continue;
      const status = String(row.status || "").toLowerCase();
      const prev = byId.get(sourceRef) || { paid: false, revoked: false };
      if (status === "refunded" || status === "reversed" || status === "canceled" || status === "cancelled" || status === "failed" || status === "unpaid") {
        prev.revoked = true;
      } else if (status === "paid" || status === "fulfilled") prev.paid = true;
      byId.set(sourceRef, prev);
    }
    for (const [sourceRef, state] of byId) {
      if (state.revoked) {
        await db.prepare(
          "UPDATE kide_funnel_paid SET refunded_at = COALESCE(refunded_at, ?) WHERE source_ref = ?",
        ).bind(ts, sourceRef).run();
      }
      if (state.paid && !state.revoked) {
        await db.prepare(
          `INSERT INTO kide_funnel_paid (source_ref, ref, paid_at)
           VALUES (?, ?, ?)
           ON CONFLICT(source_ref) DO UPDATE SET
             refunded_at = NULL`,
        ).bind(sourceRef, code, ts).run();
      }
    }
  } catch {
    // Counting never blocks the unlock.
  }
}

export async function recordLinkOpen(request, env, now) {
  if (!request || request.method !== "GET") return;
  let code = null;
  try { code = normalizeRef(new URL(request.url).searchParams.get("ref")); } catch { code = null; }
  if (!code) return;
  const ua = request.headers.get("user-agent") || "";
  const preview = isPreviewFetch(ua);
  const step = preview ? "link_preview" : "link_open";
  const detail = preview ? "preview" : deviceClass(ua);
  const ts = typeof now === "number" ? now : Date.now();
  await recordStep(env, { step, ref: code, detail, now: ts });
  if (!preview) await claimAlert(env, { step, ref: code, now: ts });
}

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * POST /api/funnel {step, detail}. Browser steps from parent-facing pages.
 * The share code comes from the kide_ref cookie, never from the body.
 * A qa field on the body is ignored, so it cannot hide the row.
 */
export async function handleFunnel(request, env, now) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  let text = "";
  try { text = await request.text(); } catch { return json({ ok: false }, 400); }
  if (text.length > 500) return json({ ok: false }, 400);
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { return json({ ok: false }, 400); }
  const step = body && typeof body.step === "string" ? body.step : "";
  if (!Object.prototype.hasOwnProperty.call(BROWSER_STEPS, step)) return json({ ok: false }, 400);
  await recordStep(env, {
    step,
    ref: refFromRequest(request),
    detail: body.detail,
    now,
  }, BROWSER_STEPS);
  return json({ ok: true }, 200);
}
