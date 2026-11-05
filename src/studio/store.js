// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// kide_lessons lives in the shared D1 database. A row is pending until the
// parent approves it. The child playlist reads status = 'approved' only.

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

const ready = new WeakSet();

async function ensureSchema(db) {
  if (!db || ready.has(db)) return;
  const stmt = db.prepare(LESSONS_SQL);
  if (typeof db.batch === "function") await db.batch([stmt]);
  else await stmt.run();
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
