// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// kide_lessons lives in the shared D1 database. A row is pending until the
// parent approves it. The child playlist reads status = 'approved' only.
// A signed-in parent can delete every row for their id whether or not a
// current generation period is open. Rows stay until that delete. There is
// no invented retention term.
//
// One successful lesson counts toward the hour allowance only after it is
// stored. A failed try does not. Attempts are a separate hour count, so a
// string of failures cannot be described as eight finished lessons. One
// lease is in flight at a time. The lease is a single conditional UPDATE,
// so two overlapping tries cannot both take the slot. A finish for an old
// lease token does not clear a newer one. A lease that has already expired
// can be taken again.

const LESSONS_SQL = `CREATE TABLE IF NOT EXISTS kide_lessons (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  age_band TEXT NOT NULL,
  skill_gaps TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT
)`;

const QUOTA_SQL = `CREATE TABLE IF NOT EXISTS kide_studio_quota (
  parent_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  generated INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  inflight INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
)`;

const QUOTA_ALTERS = [
  `ALTER TABLE kide_studio_quota ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE kide_studio_quota ADD COLUMN lease_token TEXT`,
  `ALTER TABLE kide_studio_quota ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0`,
];

const HOUR_MS = 60 * 60 * 1000;
/** Successful stored lessons in the current hour. Not a purchased credit. */
export const STUDIO_HOUR_CAP = 8;
/** Tries in the current hour, including ones that do not store a lesson. */
export const STUDIO_ATTEMPT_CAP = 24;
export const STUDIO_INFLIGHT = 1;
export const STUDIO_LEASE_MS = 2 * 60 * 1000;

const ready = new WeakSet();

async function ensureSchema(db) {
  if (!db || ready.has(db)) return;
  const stmts = [db.prepare(LESSONS_SQL), db.prepare(QUOTA_SQL)];
  if (typeof db.batch === "function") await db.batch(stmts);
  else for (const stmt of stmts) await stmt.run();
  for (const sql of QUOTA_ALTERS) {
    try {
      await db.prepare(sql).run();
    } catch {
      // The column is already on a database created with the current table.
    }
  }
  ready.add(db);
}

function rowToLesson(row) {
  if (!row) return null;
  let lesson = null;
  try {
    lesson = JSON.parse(row.lesson_json);
  } catch {
    return null;
  }
  if (!lesson || typeof lesson !== "object") return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at || null,
    ...lesson,
  };
}

export function newLessonId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `ls_${hex}`;
}

function newLeaseToken() {
  return `lq_${newLessonId().slice(3)}`;
}

export async function insertLesson(db, { id, parentId, lesson, now }) {
  await ensureSchema(db);
  await db.prepare(
    `INSERT INTO kide_lessons
      (id, parent_id, status, age_band, skill_gaps, title, lesson_json, created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    parentId,
    "pending",
    lesson.ageBand,
    JSON.stringify(lesson.skillGaps),
    lesson.title,
    JSON.stringify(lesson),
    now,
    null,
  ).run();
}

const COLS = `id, parent_id, status, age_band, skill_gaps, title, lesson_json, created_at, approved_at`;

export async function listLessons(db, parentId, { approvedOnly = false } = {}) {
  await ensureSchema(db);
  const sql = approvedOnly
    ? `SELECT ${COLS} FROM kide_lessons WHERE parent_id = ? AND status = 'approved' ORDER BY approved_at DESC`
    : `SELECT ${COLS} FROM kide_lessons WHERE parent_id = ? ORDER BY created_at DESC`;
  const out = await db.prepare(sql).bind(parentId).all();
  return (out && out.results ? out.results : []).map(rowToLesson).filter(Boolean);
}

export async function getLesson(db, parentId, id) {
  await ensureSchema(db);
  const row = await db.prepare(
    `SELECT ${COLS} FROM kide_lessons WHERE id = ? AND parent_id = ?`,
  ).bind(id, parentId).first();
  return rowToLesson(row);
}

export async function approveLesson(db, parentId, id, now) {
  await ensureSchema(db);
  const existing = await getLesson(db, parentId, id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.status === "approved") return { ok: true, lesson: existing };
  if (existing.status !== "pending") return { ok: false, error: "not_found" };
  await db.prepare(
    `UPDATE kide_lessons SET status = 'approved', approved_at = ? WHERE id = ? AND parent_id = ? AND status = 'pending'`,
  ).bind(now, id, parentId).run();
  const lesson = await getLesson(db, parentId, id);
  if (!lesson || lesson.status !== "approved") return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}

export async function deleteLesson(db, parentId, id) {
  await ensureSchema(db);
  await db.prepare(`DELETE FROM kide_lessons WHERE id = ? AND parent_id = ?`).bind(id, parentId).run();
}

export async function deleteLessons(db, parentId) {
  await ensureSchema(db);
  await db.prepare(`DELETE FROM kide_lessons WHERE parent_id = ?`).bind(parentId).run();
  await db.prepare(`DELETE FROM kide_studio_quota WHERE parent_id = ?`).bind(parentId).run();
  return { ok: true };
}

function changesOf(result) {
  const meta = result && result.meta;
  if (meta && Number.isFinite(Number(meta.changes))) return Number(meta.changes);
  if (result && Number.isFinite(Number(result.changes))) return Number(result.changes);
  return 0;
}

function denyReason(row, now) {
  if (!row) return "limited";
  const windowStart = Number(row.window_start);
  const inWindow = Number.isFinite(windowStart) && now - windowStart < HOUR_MS;
  if (Number(row.inflight) >= 1 && Number(row.lease_until) >= now) return "in_flight";
  if (inWindow && Number(row.generated) >= STUDIO_HOUR_CAP) return "lesson_cap";
  if (inWindow && Number(row.attempts) >= STUDIO_ATTEMPT_CAP) return "attempt_cap";
  return "limited";
}

export async function beginGenerate(db, parentId, now = Date.now()) {
  await ensureSchema(db);
  await db.prepare(
    `INSERT INTO kide_studio_quota
      (parent_id, window_start, generated, attempts, inflight, lease_token, lease_until)
     VALUES (?, ?, 0, 0, 0, NULL, 0)
     ON CONFLICT(parent_id) DO NOTHING`,
  ).bind(parentId, now).run();
  const token = newLeaseToken();
  const until = now + STUDIO_LEASE_MS;
  const result = await db.prepare(
    `UPDATE kide_studio_quota SET
       window_start = CASE WHEN (? - window_start) >= ? THEN ? ELSE window_start END,
       generated = CASE WHEN (? - window_start) >= ? THEN 0 ELSE generated END,
       attempts = CASE WHEN (? - window_start) >= ? THEN 1 ELSE attempts + 1 END,
       inflight = 1,
       lease_token = ?,
       lease_until = ?
     WHERE parent_id = ?
       AND (inflight = 0 OR IFNULL(lease_until, 0) < ?)
       AND (
         (? - window_start) >= ?
         OR (generated < ? AND attempts < ?)
       )`,
  ).bind(
    now, HOUR_MS, now,
    now, HOUR_MS,
    now, HOUR_MS,
    token, until,
    parentId,
    now,
    now, HOUR_MS,
    STUDIO_HOUR_CAP, STUDIO_ATTEMPT_CAP,
  ).run();
  if (changesOf(result) === 1) return { ok: true, token };
  const row = await db.prepare(
    `SELECT window_start, generated, attempts, inflight, lease_until
     FROM kide_studio_quota WHERE parent_id = ?`,
  ).bind(parentId).first();
  return { ok: false, error: denyReason(row, now) };
}

export async function commitGenerate(db, parentId, token) {
  await ensureSchema(db);
  if (!token) return false;
  const result = await db.prepare(
    `UPDATE kide_studio_quota
     SET generated = generated + 1, inflight = 0, lease_token = NULL, lease_until = 0
     WHERE parent_id = ? AND lease_token = ?`,
  ).bind(parentId, token).run();
  return changesOf(result) === 1;
}

export async function releaseGenerate(db, parentId, token) {
  await ensureSchema(db);
  if (!token) return;
  await db.prepare(
    `UPDATE kide_studio_quota
     SET inflight = 0, lease_token = NULL, lease_until = 0
     WHERE parent_id = ? AND lease_token = ?`,
  ).bind(parentId, token).run();
}
