// Money path: visit → tool use → signup → credits / paid step → Stripe.
// Parent rows and the unlock flag live in the shared D1 database, namespaced
// kide_. The sign-in code and the session cookie stay on PortfolioMessagingService.
// This module does not talk to Stripe and does not hold a key.

import { isParentId } from "./parent-id.js";

export const UNLOCK_KIND = "unlock";
export const UNLOCK_ACTIVE = "active";

const PARENTS_SQL = `CREATE TABLE IF NOT EXISTS kide_parents (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone_e164 TEXT UNIQUE,
  phone_verified_at TEXT,
  sms_opt_in_at TEXT,
  sms_opt_out INTEGER NOT NULL DEFAULT 0,
  handle TEXT,
  created_at TEXT NOT NULL
)`;

const ENTITLEMENTS_SQL = `CREATE TABLE IF NOT EXISTS kide_entitlements (
  parent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_ref TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (parent_id, kind)
)`;

const ready = new WeakSet();

async function ensureSchema(db) {
  if (ready.has(db)) return;
  const stmts = [db.prepare(PARENTS_SQL), db.prepare(ENTITLEMENTS_SQL)];
  if (typeof db.batch === "function") await db.batch(stmts);
  else for (const stmt of stmts) await stmt.run();
  ready.add(db);
}

// Insert the parent if this email or phone is new. Return the stored id,
// which stays put if the row already existed.
export async function ensureParent(db, { id, email, phone }) {
  await ensureSchema(db);
  const now = new Date().toISOString();
  if (email) {
    await db.prepare(
      `INSERT INTO kide_parents (id, email, phone_e164, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    ).bind(id, email, phone || null, now).run();
    const row = await db.prepare(`SELECT id FROM kide_parents WHERE email = ?`).bind(email).first();
    if (row && row.id) {
      if (phone) {
        await db.prepare(
          `UPDATE kide_parents SET phone_e164 = ? WHERE id = ? AND phone_e164 IS NULL`,
        ).bind(phone, row.id).run();
      }
      return String(row.id);
    }
  }
  if (phone) {
    await db.prepare(
      `INSERT INTO kide_parents (id, email, phone_e164, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(phone_e164) DO NOTHING`,
    ).bind(id, email || null, phone, now).run();
    const row = await db.prepare(`SELECT id FROM kide_parents WHERE phone_e164 = ?`).bind(phone).first();
    if (row && row.id) return String(row.id);
  }
  return id;
}

export async function readUnlocked(db, parentId) {
  await ensureSchema(db);
  const row = await db.prepare(
    `SELECT status FROM kide_entitlements WHERE parent_id = ? AND kind = ?`,
  ).bind(parentId, UNLOCK_KIND).first();
  return Boolean(row && row.status === UNLOCK_ACTIVE);
}

// The unlock feature calls this after a purchase clears. It is not an HTTP route.
// status is "active" or "inactive". A refund passes "inactive".
export async function setUnlock(env, parentId, sourceRef, status = UNLOCK_ACTIVE) {
  if (!env || !env.DB) return false;
  if (!isParentId(parentId)) return false;
  if (status !== UNLOCK_ACTIVE && status !== "inactive") return false;
  const ref = typeof sourceRef === "string" ? sourceRef.slice(0, 200) : "";
  const now = new Date().toISOString();
  try {
    await ensureSchema(env.DB);
    await env.DB.prepare(
      `INSERT INTO kide_entitlements (parent_id, kind, source_ref, status, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(parent_id, kind) DO UPDATE SET
         source_ref = excluded.source_ref,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    ).bind(parentId, UNLOCK_KIND, ref, status, now).run();
    return true;
  } catch {
    return false;
  }
}
