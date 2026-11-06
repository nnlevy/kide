// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// kide_lessons lives in the shared D1 database. A row is pending until the
// parent approves it. The child playlist reads status = 'approved' only.
// A parent can delete every row for their id. There is no invented retention
// term — rows stay until that delete, matching the existing local "Delete
// everything" control on the parent page.
// Generation caps reuse the play-events hour window pattern (src/perf/http.js).

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
  inflight INTEGER NOT NULL
)`;

const HOUR_MS = 60 * 60 * 1000;
/** Same hour-window idea as kide_play_events HOUR_CAP. Tight because each
 *  generate calls PORTFOLIO_AI_SERVICE. Not a purchased quota. */
export const STUDIO_HOUR_CAP = 8;
export const STUDIO_INFLIGHT = 1;

const ready = new WeakSet();

async function ensureSchema(db) {
  if (!db || ready.has(db)) return;
  const stmts = [db.prepare(LESSONS_SQL), db.prepare(QUOTA_SQL)];
  if (typeof db.batch === "function") await db.batch(stmts);
  else for (const stmt of stmts) await stmt.run();
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

export async function deleteLessons(db, parentId) {
  await ensureSchema(db);
  await db.prepare(`DELETE FROM kide_lessons WHERE parent_id = ?`).bind(parentId).run();
  await db.prepare(`DELETE FROM kide_studio_quota WHERE parent_id = ?`).bind(parentId).run();
  return { ok: true };
}

export async function beginGenerate(db, parentId, now = Date.now()) {
  await ensureSchema(db);
  const row = await db.prepare(
    `SELECT window_start, generated, inflight FROM kide_studio_quota WHERE parent_id = ?`,
  ).bind(parentId).first();
  let windowStart = row && Number(row.window_start);
  let generated = row && Number(row.generated);
  let inflight = row && Number(row.inflight);
  if (!Number.isFinite(windowStart) || now - windowStart >= HOUR_MS) {
    windowStart = now;
    generated = 0;
    inflight = 0;
  }
  if (!Number.isFinite(generated)) generated = 0;
  if (!Number.isFinite(inflight)) inflight = 0;
  if (inflight >= STUDIO_INFLIGHT || generated >= STUDIO_HOUR_CAP) {
    return { ok: false, error: "limited" };
  }
  inflight += 1;
  generated += 1;
  await db.prepare(
    `INSERT INTO kide_studio_quota (parent_id, window_start, generated, inflight)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(parent_id) DO UPDATE SET
       window_start = excluded.window_start,
       generated = excluded.generated,
       inflight = excluded.inflight`,
  ).bind(parentId, windowStart, generated, inflight).run();
  return { ok: true };
}

export async function finishGenerate(db, parentId) {
  await ensureSchema(db);
  const row = await db.prepare(
    `SELECT inflight FROM kide_studio_quota WHERE parent_id = ?`,
  ).bind(parentId).first();
  const inflight = Math.max(0, (row && Number(row.inflight) || 0) - 1);
  await db.prepare(
    `UPDATE kide_studio_quota SET inflight = ? WHERE parent_id = ?`,
  ).bind(inflight, parentId).run();
}
