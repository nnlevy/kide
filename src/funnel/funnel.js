// Conversion funnel for family play: from a tap on a share link to a paid unlock.
//
// kide.us is directed to children, so a persistent identifier collected here
// is personal information under COPPA. A row is one step, the time it happened,
// and the sharer's code when a share link was followed. It does not carry a
// visitor id, a cookie value, an IP address, an email, a user agent string, or
// anything a child typed or did inside a game.
//
// The share code is the join key. Counts for one code can be read together,
// which shows how families who followed that link moved through the site. It
// does not name the child. The code and the totals of opens, checkouts, and
// paid purchases are sent to the billing hub, which queues a referral credit
// and can email the owner. This file does not pay anyone.
//
// Where steps come from:
//   server  link_open, link_preview   GET / with ?ref=CODE (worker/index.ts)
//   server  play_day, gate_day        the free-play meter's own ticks
//                                     (unlock/handler.js), counted once per
//                                     device per day, with the share code from
//                                     the cookie. The play page does not send a
//                                     separate step list.
//   server  checkout_open, checkout_fail, paid   unlock/handler.js
//   browser home_cta, unlock_view, check_pass, check_fail, checkout_click,
//           checkout_back            parent-facing pages only: / and /unlock.
//                                     /play does not call /api/funnel.
//
// The share code on a row is the sharer's (an adult's) code, from the
// kide_ref cookie the share link already sets. It says who sent the link,
// never who opened it.

import { normalizeRef, refFromRequest } from "../referral/ref.js";

export const DOMAIN = "kide.us";

// Step -> allowed detail values. A detail outside its list is stored as "".
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

// The two kinds of row that matter to Nir as they happen.
const ALERT_STEPS = { link_open: "opened", checkout_open: "reached checkout for" };
const ALERT_GAP_MS = 10 * 60 * 1000;
const ALERT_DAY_CAP = 20;

export function deviceClass(ua) {
  const s = String(ua || "");
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(s)) return "tablet";
  if (/iPhone|iPod|Android.*Mobile|Mobile/i.test(s)) return "phone";
  return "computer";
}

// Message apps fetch a link to draw its preview card before anyone taps it.
// iMessage sends "facebookexternalhit ... Facebot Twitterbot". That fetch is
// not a tap. WhatsApp's in-app browser is a tap: its UA is a normal browser
// that also says WhatsApp. The preview fetcher's UA is only "WhatsApp/<version>".
// Pinterest's in-app browser likewise names Pinterest; the crawler is
// Pinterestbot or the short "Pinterest/<digits>" fetcher. A UA that merely
// contains the word "preview" is not a crawler.
export function isPreviewFetch(ua) {
  const s = String(ua || "").trim();
  if (/^WhatsApp\//i.test(s)) return true;
  if (/Pinterestbot|(?:^|\s)Pinterest\/\d/i.test(s)) return true;
  return /facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|Discordbot|LinkedInBot|SkypeUriPreview|\bbot\b|crawler|spider/i.test(s);
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
async function ensureTable(db) {
  if (ready) return;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS kide_funnel_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,
      step TEXT NOT NULL,
      ref TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      qa INTEGER NOT NULL DEFAULT 0,
      alerted INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS kide_funnel_events_day ON kide_funnel_events(day, step, ref)"
  ).run();
  ready = true;
}

/** Test hook: forget that the table was created. */
export function resetForTests() {
  ready = false;
}

/**
 * Stores one step. Never throws: measuring must not break the page or a
 * checkout. Returns the row id, or 0 when nothing was stored.
 */
export async function recordStep(env, { step, ref, detail, qa, now }, steps = SERVER_STEPS) {
  const db = dbOf(env);
  if (!db) return 0;
  const clean = cleanDetail(steps, step, detail);
  if (clean === null) return 0;
  const ts = typeof now === "number" ? now : Date.now();
  try {
    await ensureTable(db);
    const res = await db.prepare(
      "INSERT INTO kide_funnel_events (ts, day, step, ref, detail, qa) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(ts, new Date(ts).toISOString().slice(0, 10), step, normalizeRef(ref) || "", clean, qa ? 1 : 0).run();
    return Number(res && res.meta && res.meta.last_row_id) || 0;
  } catch {
    return 0;
  }
}

// A link the owner or a QA script opens on purpose carries kide_qa=1. Those
// rows are kept apart and never alert. The server records that from the URL
// it served, then from the cookie it set. A qa field in a POST body is ignored.
export const QA_COOKIE = "kide_qa";

export function isQa(url) {
  try { return new URL(url).searchParams.get("kide_qa") === "1"; } catch { return false; }
}

export function qaFromRequest(request) {
  if (request && isQa(request.url)) return true;
  const raw = (request && request.headers && request.headers.get("cookie")) || "";
  return new RegExp(`(?:^|;\\s*)${QA_COOKIE}=1(?:;|$)`).test(raw);
}

// Session cookie, set only when this request's URL carries kide_qa=1.
// HttpOnly so the page script cannot rewrite the flag it then posts back.
export function withQaCookie(request, response) {
  if (!request || !response || !isQa(request.url)) return response;
  const out = new Response(response.body, response);
  out.headers.append("Set-Cookie", `${QA_COOKIE}=1; HttpOnly; Secure; SameSite=Lax; Path=/`);
  return out;
}

/**
 * Tells Nir, through the billing hub's owner email, that a share link was
 * opened or reached checkout. At most one alert per code per ten minutes and
 * twenty per day, so a family reloading the page is one alert, not five.
 */
export async function alertOwner(env, { rowId, step, ref, detail, now }) {
  const code = normalizeRef(ref);
  const verb = ALERT_STEPS[step];
  const db = dbOf(env);
  const billing = env && env.PORTFOLIO_BILLING_SERVICE;
  if (!code || !verb || !rowId || !db || !billing || typeof billing.notifyReferralActivity !== "function") return false;
  const ts = typeof now === "number" ? now : Date.now();
  try {
    const recent = await db.prepare(
      "SELECT COUNT(*) AS n FROM kide_funnel_events WHERE ref = ? AND alerted = 1 AND ts > ?"
    ).bind(code, ts - ALERT_GAP_MS).first();
    if (recent && Number(recent.n) > 0) return false;
    const today = await db.prepare(
      "SELECT COUNT(*) AS n FROM kide_funnel_events WHERE ref = ? AND alerted = 1 AND day = ?"
    ).bind(code, new Date(ts).toISOString().slice(0, 10)).first();
    if (today && Number(today.n) >= ALERT_DAY_CAP) return false;
    const counts = await db.prepare(
      `SELECT step, COUNT(*) AS n FROM kide_funnel_events
       WHERE ref = ? AND qa = 0 AND step IN ('link_open','checkout_open','paid') GROUP BY step`
    ).bind(code).all();
    const totals = {};
    for (const row of (counts && counts.results) || []) totals[row.step] = Number(row.n) || 0;
    const out = await billing.notifyReferralActivity({
      domain: DOMAIN,
      code,
      step,
      device: detail || "",
      at: new Date(ts).toISOString(),
      opens: totals.link_open || 0,
      checkouts: totals.checkout_open || 0,
      paid: totals.paid || 0,
    });
    if (!(out && out.ok)) return false;
    await db.prepare("UPDATE kide_funnel_events SET alerted = 1 WHERE id = ?").bind(rowId).run();
    return true;
  } catch {
    return false;
  }
}

/** Server side of a share-link page load: GET / with ?ref=CODE. */
export async function recordLinkOpen(request, env, ctx, now) {
  if (!request || request.method !== "GET") return;
  let code = null;
  try { code = normalizeRef(new URL(request.url).searchParams.get("ref")); } catch { code = null; }
  if (!code) return;
  const ua = request.headers.get("user-agent") || "";
  const qa = qaFromRequest(request);
  const preview = isPreviewFetch(ua);
  const step = preview ? "link_preview" : "link_open";
  const detail = preview ? "preview" : deviceClass(ua);
  const ts = typeof now === "number" ? now : Date.now();
  const rowId = await recordStep(env, { step, ref: code, detail, qa, now: ts });
  if (preview || qa || !rowId) return;
  const work = alertOwner(env, { rowId, step, ref: code, detail, now: ts });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work);
  else await work;
}

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * POST /api/funnel {step, detail}. Browser steps from parent-facing pages.
 * The share code comes from the kide_ref cookie, never from the body.
 * QA comes from ?kide_qa=1 or the cookie set from that URL. body.qa is ignored.
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
    qa: qaFromRequest(request),
    now,
  }, BROWSER_STEPS);
  return json({ ok: true }, 200);
}
