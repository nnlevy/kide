// Weekly board on the shared D1 (domains-db).
//
// Money path: free Pip practice (tool use) → https://kide.us/pricing → /clinician/
// ($39 licence). No new price.
//
// What is stored for the board: a nickname a grown-up chose, and points.
// No child name, no email, no voice. The player id is a random token from
// the browser. account_id stays empty until parent accounts pass one in.
// A later account module can call linkAccount without changing this file's
// callers.

import {
  BOARD_CAP, WINDOW_MS, WINDOW_MAX,
  tierForStreak, validPlayerId, validQuestionId, validAccountId,
  cleanHandle, weekKey, judge, randomId,
} from "./score.js";
import { makeQuestion } from "./questions.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kide_compete_players (
    player_id TEXT PRIMARY KEY,
    account_id TEXT,
    handle TEXT NOT NULL DEFAULT '',
    show_board INTEGER NOT NULL DEFAULT 0,
    week TEXT NOT NULL,
    week_points INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    open_id TEXT,
    window_start INTEGER NOT NULL DEFAULT 0,
    window_count INTEGER NOT NULL DEFAULT 0,
    spent TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS kide_compete_questions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    tier INTEGER NOT NULL,
    answer TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    limit_ms INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS kide_scores (
    player_id TEXT NOT NULL,
    week TEXT NOT NULL,
    points INTEGER NOT NULL,
    handle_snapshot TEXT NOT NULL DEFAULT '',
    account_id TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, week)
  )`,
];

async function run(db, sql, args = []) {
  const stmt = db.prepare(sql);
  if (args.length) return stmt.bind(...args).run();
  return stmt.run();
}

async function first(db, sql, args = []) {
  const stmt = db.prepare(sql);
  if (args.length) return stmt.bind(...args).first();
  return stmt.first();
}

async function all(db, sql, args = []) {
  const stmt = db.prepare(sql);
  const out = args.length ? await stmt.bind(...args).all() : await stmt.all();
  return (out && out.results) || [];
}

export async function ensureSchema(db) {
  for (const sql of SCHEMA) await run(db, sql);
}

function spentIds(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) {
    if (validQuestionId(id) && out.indexOf(id) === -1) out.push(id);
  }
  return out.slice(-WINDOW_MAX);
}

function freshPlayer(playerId, now) {
  return {
    player_id: playerId,
    account_id: null,
    handle: "",
    show_board: 0,
    week: weekKey(new Date(now)),
    week_points: 0,
    streak: 0,
    open_id: null,
    window_start: 0,
    window_count: 0,
    spent: [],
  };
}

function fromRow(row, playerId, now) {
  if (!row) return freshPlayer(playerId, now);
  const cleaned = cleanHandle(row.handle);
  const show = row.show_board === 1 && cleaned.ok;
  return {
    player_id: playerId,
    account_id: validAccountId(row.account_id) ? row.account_id : null,
    handle: show ? cleaned.handle : "",
    show_board: show ? 1 : 0,
    week: typeof row.week === "string" && /^\d{4}-W\d{2}$/.test(row.week) ? row.week : weekKey(new Date(now)),
    week_points: Math.max(0, Math.min(1000000, Math.floor(Number(row.week_points) || 0))),
    streak: Math.max(0, Math.min(1000, Math.floor(Number(row.streak) || 0))),
    open_id: validQuestionId(row.open_id) ? row.open_id : null,
    window_start: Math.max(0, Math.floor(Number(row.window_start) || 0)),
    window_count: Math.max(0, Math.floor(Number(row.window_count) || 0)),
    spent: spentIds(row.spent),
  };
}

async function loadPlayer(db, playerId, now) {
  const row = await first(db, "SELECT * FROM kide_compete_players WHERE player_id = ?", [playerId]);
  return fromRow(row, playerId, now);
}

async function savePlayer(db, player) {
  await run(db, `INSERT INTO kide_compete_players (
      player_id, account_id, handle, show_board, week, week_points, streak,
      open_id, window_start, window_count, spent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      account_id = excluded.account_id,
      handle = excluded.handle,
      show_board = excluded.show_board,
      week = excluded.week,
      week_points = excluded.week_points,
      streak = excluded.streak,
      open_id = excluded.open_id,
      window_start = excluded.window_start,
      window_count = excluded.window_count,
      spent = excluded.spent`, [
    player.player_id,
    player.account_id,
    player.show_board ? player.handle : "",
    player.show_board ? 1 : 0,
    player.week,
    player.week_points,
    player.streak,
    player.open_id,
    player.window_start,
    player.window_count,
    JSON.stringify(player.spent),
  ]);
}

function rollWeek(player, now) {
  const week = weekKey(new Date(now));
  if (player.week !== week) {
    player.week = week;
    player.week_points = 0;
    player.streak = 0;
  }
  return week;
}

function withinWindow(player, now) {
  if (!player.window_start || now - player.window_start >= WINDOW_MS) {
    player.window_start = now;
    player.window_count = 0;
  }
  return player.window_count < WINDOW_MAX;
}

function rememberSpent(player, id) {
  if (!validQuestionId(id)) return;
  if (player.spent.indexOf(id) === -1) player.spent.push(id);
  player.spent = player.spent.slice(-WINDOW_MAX);
}

async function closeOpen(db, player) {
  if (!player.open_id) return;
  const prev = await first(db, "SELECT id, used FROM kide_compete_questions WHERE id = ?", [player.open_id]);
  if (prev && prev.used !== 1) {
    await run(db, "UPDATE kide_compete_questions SET used = 1 WHERE id = ?", [player.open_id]);
    player.streak = 0;
  }
  rememberSpent(player, player.open_id);
  player.open_id = null;
}

async function loadQuestion(db, id) {
  return first(db, "SELECT * FROM kide_compete_questions WHERE id = ?", [id]);
}

/**
 * Tag an anonymous player with a parent account id.
 * The first id sticks. A different id does not replace it.
 * Accounts can call this when sessions exist; until then it is unused.
 */
export async function linkAccount(db, playerId, accountId, now = Date.now()) {
  if (!validPlayerId(playerId) || !validAccountId(accountId)) {
    return { ok: false, linked: false };
  }
  await ensureSchema(db);
  let player = await loadPlayer(db, playerId, now);
  if (player.account_id && player.account_id !== accountId) {
    return { ok: true, linked: false, accountId: player.account_id };
  }
  player.account_id = accountId;
  if (!player.week) player = freshPlayer(playerId, now);
  player.account_id = accountId;
  await savePlayer(db, player);
  await run(
    db,
    "UPDATE kide_scores SET account_id = ? WHERE player_id = ? AND (account_id IS NULL OR account_id = ?)",
    [accountId, playerId, accountId]
  );
  return { ok: true, linked: true, accountId };
}

function attachAccount(player, accountId) {
  if (!validAccountId(accountId)) return;
  if (!player.account_id) player.account_id = accountId;
}

async function putOnBoard(db, player) {
  if (!player.show_board || !player.handle) return;
  await run(db, `INSERT INTO kide_scores (player_id, week, points, handle_snapshot, account_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, week) DO UPDATE SET
      points = excluded.points,
      handle_snapshot = excluded.handle_snapshot,
      account_id = COALESCE(excluded.account_id, kide_scores.account_id),
      updated_at = excluded.updated_at`, [
    player.player_id,
    player.week,
    player.week_points,
    player.handle,
    player.account_id,
    Date.now(),
  ]);
}

async function takeOffBoard(db, playerId, week) {
  await run(db, "DELETE FROM kide_scores WHERE player_id = ? AND week = ?", [playerId, week]);
}

export async function issueQuestion(db, playerId, now, rng, accountId) {
  await ensureSchema(db);
  const player = await loadPlayer(db, playerId, now);
  attachAccount(player, accountId);
  rollWeek(player, now);
  if (!withinWindow(player, now)) {
    await savePlayer(db, player);
    return { status: 429, body: { ok: false, code: "rest" } };
  }
  await closeOpen(db, player);
  player.window_count += 1;
  const tier = tierForStreak(player.streak);
  const id = randomId(rng);
  const { secret, pub } = makeQuestion(tier, rng, now, id);
  player.open_id = id;
  await run(db, `INSERT INTO kide_compete_questions
    (id, player_id, tier, answer, issued_at, limit_ms, used)
    VALUES (?, ?, ?, ?, ?, ?, 0)`, [
    secret.id, playerId, secret.tier, secret.answer, secret.issuedAt, secret.limitMs,
  ]);
  await savePlayer(db, player);
  await run(db, "DELETE FROM kide_compete_questions WHERE used = 1 AND issued_at < ?", [now - 120000]);
  return {
    status: 200,
    body: { ok: true, question: pub, streak: player.streak, weekPoints: player.week_points },
  };
}

export async function answerQuestion(db, playerId, questionId, choice, now, accountId) {
  await ensureSchema(db);
  const player = await loadPlayer(db, playerId, now);
  attachAccount(player, accountId);
  rollWeek(player, now);
  const quiet = {
    status: 200,
    body: { ok: true, correct: false, points: 0, streak: player.streak, weekPoints: player.week_points },
  };
  if (questionId && player.spent.indexOf(questionId) !== -1) {
    await savePlayer(db, player);
    return quiet;
  }
  const q = questionId ? await loadQuestion(db, questionId) : null;
  if (!q || q.player_id !== playerId || q.used === 1) {
    await savePlayer(db, player);
    return quiet;
  }
  const judged = judge({
    issuedAt: q.issued_at,
    now,
    limitMs: q.limit_ms,
    used: q.used === 1,
    choice,
    answer: q.answer,
    tier: q.tier,
    streak: player.streak,
  });
  if (judged.consume && q.used !== 1) {
    await run(db, "UPDATE kide_compete_questions SET used = 1 WHERE id = ?", [q.id]);
    rememberSpent(player, q.id);
  }
  if (player.open_id === q.id) player.open_id = null;
  if (!judged.accepted) {
    player.streak = 0;
    await savePlayer(db, player);
    return { status: 200, body: { ok: true, correct: false, points: 0, streak: 0, weekPoints: player.week_points } };
  }
  player.streak = judged.correct ? judged.streak : 0;
  if (judged.correct) player.week_points += judged.points;
  await savePlayer(db, player);
  if (judged.correct) await putOnBoard(db, player);
  return {
    status: 200,
    body: {
      ok: true,
      correct: judged.correct,
      points: judged.correct ? judged.points : 0,
      streak: player.streak,
      weekPoints: player.week_points,
    },
  };
}

export async function setHandle(db, playerId, handle, show, now, accountId) {
  await ensureSchema(db);
  const player = await loadPlayer(db, playerId, now);
  attachAccount(player, accountId);
  rollWeek(player, now);
  const want = show === true;
  if (!want) {
    player.handle = "";
    player.show_board = 0;
    await savePlayer(db, player);
    await takeOffBoard(db, playerId, player.week);
    return { status: 200, body: { ok: true, handle: "", show: false } };
  }
  const cleaned = cleanHandle(handle);
  if (!cleaned.ok) return { status: 400, body: { ok: false, message: cleaned.message } };
  player.handle = cleaned.handle;
  player.show_board = 1;
  await savePlayer(db, player);
  await putOnBoard(db, player);
  return { status: 200, body: { ok: true, handle: player.handle, show: true } };
}

export async function getBoard(db, now) {
  await ensureSchema(db);
  const week = weekKey(new Date(now));
  const rows = await all(
    db,
    `SELECT handle_snapshot, points FROM kide_scores
     WHERE week = ? AND handle_snapshot != ''
     ORDER BY points DESC, handle_snapshot ASC
     LIMIT ?`,
    [week, BOARD_CAP]
  );
  const entries = [];
  for (const row of rows) {
    const h = cleanHandle(row.handle_snapshot);
    if (!h.ok) continue;
    entries.push({
      handle: h.handle,
      points: Math.max(0, Math.min(1000000, Math.floor(Number(row.points) || 0))),
    });
  }
  return { status: 200, body: { ok: true, title: "This week", entries } };
}
