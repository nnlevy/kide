// Practice timing sync.
//
// Anonymous play does not write here. When a parent is signed in, each
// sample is stored as latency only: item, skill, whether it was correct.
// The id is currentParent(request, env).parentId. A value sent in the body
// is ignored. These rows are not points and never feed the weekly board.
//
// Money path: free Pip practice → https://kide.us/pricing → /clinician/ ($39 licence).

import { latencyOf, SKILLS } from "./track.js";
import { validPlayerId } from "../compete/score.js";
import { parentIdFrom } from "../compete/account.js";

const HOUR_CAP = 200;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function ensureEvents(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS kide_play_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      lesson_id TEXT,
      latency_ms INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      mode TEXT NOT NULL,
      ts INTEGER NOT NULL
    )`
  ).run();
}

function cleanItem(id) {
  return typeof id === "string" && /^[a-zA-Z0-9:_-]{1,64}$/.test(id) ? id : "";
}

function oneEvent(raw, accountId, playerId, now) {
  if (!raw || typeof raw !== "object") return null;
  if (!SKILLS[raw.skill]) return null;
  const item = cleanItem(raw.item_id);
  if (!item) return null;
  const correct = raw.correct === true;
  const latency = latencyOf({
    correct: true,
    shown_at: raw.shown_at,
    answered_at: raw.answered_at,
  });
  // Incorrect answers are kept only when the clock still looks like a person
  // was sitting with the question. A missing clock is dropped.
  const shown = Number(raw.shown_at);
  const answered = Number(raw.answered_at);
  const gap = Number.isFinite(shown) && Number.isFinite(answered) ? Math.round(answered - shown) : null;
  const latencyMs = correct ? latency : (gap != null && gap >= 80 && gap <= 120000 ? gap : null);
  if (latencyMs == null) return null;
  const mode = raw.mode === "challenge" ? "challenge" : "practice";
  const lesson = cleanItem(raw.lesson_id);
  return {
    playerId,
    accountId,
    itemId: item,
    skill: raw.skill,
    lessonId: lesson || null,
    latencyMs,
    correct: correct ? 1 : 0,
    mode,
    ts: now,
  };
}

function databaseOf(dbOrEnv) {
  if (dbOrEnv && typeof dbOrEnv.prepare === "function") return dbOrEnv;
  if (dbOrEnv && dbOrEnv.DB && typeof dbOrEnv.DB.prepare === "function") return dbOrEnv.DB;
  return null;
}

function sessionEnv(dbOrEnv, db) {
  if (dbOrEnv && (dbOrEnv.PORTFOLIO_MESSAGING_SERVICE || dbOrEnv.DB)) {
    return dbOrEnv.DB ? dbOrEnv : { ...dbOrEnv, DB: db };
  }
  return { DB: db };
}

export async function handlePlayEvents(request, dbOrEnv, now = Date.now()) {
  const db = databaseOf(dbOrEnv);
  if (!db) return json({ ok: true, stored: "device" }, 200);
  let text = "";
  try { text = await request.text(); } catch { return json({ ok: false, message: "Pip couldn't save that." }, 400); }
  if (text.length > 12000) return json({ ok: false, message: "Pip couldn't save that." }, 400);
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { return json({ ok: false, message: "Pip couldn't save that." }, 400); }
  const accountId = await parentIdFrom(request, sessionEnv(dbOrEnv, db));
  if (!accountId) return json({ ok: true, stored: "device" }, 200);
  if (!validPlayerId(body.playerId)) return json({ ok: false, message: "Pip couldn't save that." }, 400);
  const list = Array.isArray(body.events) ? body.events.slice(0, 40) : [];
  try {
    await ensureEvents(db);
    const since = now - 60 * 60 * 1000;
    const prior = await db.prepare(
      "SELECT COUNT(*) AS n FROM kide_play_events WHERE player_id = ? AND ts > ?"
    ).bind(body.playerId, since).first();
    const already = prior && Number(prior.n) || 0;
    if (already >= HOUR_CAP) return json({ ok: true, stored: "device" }, 200);
    let wrote = 0;
    for (const raw of list) {
      if (already + wrote >= HOUR_CAP) break;
      const row = oneEvent(raw, accountId, body.playerId, now);
      if (!row) continue;
      await db.prepare(
        `INSERT INTO kide_play_events
          (player_id, account_id, item_id, skill, lesson_id, latency_ms, correct, mode, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        row.playerId, row.accountId, row.itemId, row.skill, row.lessonId,
        row.latencyMs, row.correct, row.mode, row.ts
      ).run();
      wrote += 1;
    }
    return json({ ok: true, stored: "account", n: wrote }, 200);
  } catch {
    return json({ ok: true, stored: "device" }, 200);
  }
}
