// Money path: paid parent's share link → referred parent's $15 family_unlock
// → $6 cash. This ledger is not the credits balance and not kide_entitlements.
// Nir chose Stripe Connect for sending the cash. This file records the request
// only. It does not create a Connect account, a price, or a transfer.

import { normalizeRef } from "./ref.js";

export const REWARD_CENTS = 600;
export const HOLD_MS = 14 * 24 * 60 * 60 * 1000;
export const PAYOUT_AT_CENTS = 5000;
export const PAYOUT_METHOD = "stripe_connect";
export const FAMILY_OFFERING = "family_unlock";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kide_referral_codes (
    parent_id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    card_fp TEXT,
    ip_cluster TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS kide_referral_ledger (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT NOT NULL,
    code TEXT NOT NULL,
    purchase_ref TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    hold_until TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payout_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS kide_referral_payouts (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    method TEXT NOT NULL,
    live INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS kide_referral_ledger_referrer ON kide_referral_ledger(referrer_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kide_referral_payout_open
     ON kide_referral_payouts(parent_id) WHERE status = 'requested'`,
];

function iso(ms) {
  return new Date(ms).toISOString();
}

function randomId(prefix) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return prefix + hex;
}

function randomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

async function run(db, sql, args = []) {
  const stmt = db.prepare(sql);
  const bound = args.length ? stmt.bind(...args) : stmt;
  return bound.run();
}

async function first(db, sql, args = []) {
  const stmt = db.prepare(sql);
  const bound = args.length ? stmt.bind(...args) : stmt;
  return bound.first();
}

async function all(db, sql, args = []) {
  const stmt = db.prepare(sql);
  const bound = args.length ? stmt.bind(...args) : stmt;
  const out = await bound.all();
  return (out && out.results) || [];
}

export async function ensureReferralSchema(db) {
  for (const sql of SCHEMA) await run(db, sql);
}

export function ipCluster(ip) {
  if (typeof ip !== "string") return null;
  const raw = ip.trim();
  if (!raw || raw.length > 80) return null;
  const v4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `v4:${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  if (raw.includes(":")) {
    const groups = raw.split(":").map((g) => g.trim()).filter(Boolean);
    if (groups.length < 2) return null;
    return `v6:${groups.slice(0, 4).join(":").toLowerCase()}`;
  }
  return null;
}

export function cleanPhone(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^\d]/g, "");
  const us = digits.length === 10 ? `1${digits}` : digits;
  if (us.length < 10 || us.length > 15) return null;
  return us;
}

export function cleanCard(value) {
  if (typeof value !== "string") return null;
  const card = value.trim();
  if (!/^[A-Za-z0-9_]{6,64}$/.test(card)) return null;
  return card;
}

function shareLink(code) {
  return `https://kide.us/r/${code}`;
}

export async function codeForParent(db, parentId) {
  await ensureReferralSchema(db);
  return first(db, `SELECT * FROM kide_referral_codes WHERE parent_id = ?`, [parentId]);
}

export async function codeByValue(db, code) {
  await ensureReferralSchema(db);
  const normalized = normalizeRef(code);
  if (!normalized) return null;
  return first(db, `SELECT * FROM kide_referral_codes WHERE code = ?`, [normalized]);
}

export async function issueCode(db, { parentId, email, phone, cardFp, ip }) {
  await ensureReferralSchema(db);
  if (typeof parentId !== "string" || !parentId) return null;
  const signals = {
    email: typeof email === "string" && email.includes("@") ? email.slice(0, 254) : null,
    phone: cleanPhone(phone),
    cardFp: cleanCard(cardFp),
    ipCluster: ipCluster(ip),
  };
  const existing = await codeForParent(db, parentId);
  if (existing) {
    await run(
      db,
      `UPDATE kide_referral_codes
         SET email = COALESCE(email, ?),
             phone = COALESCE(phone, ?),
             card_fp = COALESCE(card_fp, ?),
             ip_cluster = COALESCE(ip_cluster, ?)
       WHERE parent_id = ?`,
      [signals.email, signals.phone, signals.cardFp, signals.ipCluster, parentId],
    );
    const row = await codeForParent(db, parentId);
    return { code: row.code, link: shareLink(row.code), fresh: false };
  }
  const createdAt = iso(Date.now());
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    try {
      await run(
        db,
        `INSERT INTO kide_referral_codes
           (parent_id, code, email, phone, card_fp, ip_cluster, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [parentId, code, signals.email, signals.phone, signals.cardFp, signals.ipCluster, createdAt],
      );
      return { code, link: shareLink(code), fresh: true };
    } catch {
      const raced = await codeForParent(db, parentId);
      if (raced) return { code: raced.code, link: shareLink(raced.code), fresh: false };
    }
  }
  return null;
}

function samePerson(owner, buyer) {
  if (!owner || !buyer) return false;
  if (owner.parent_id && buyer.parentId && owner.parent_id === buyer.parentId) return true;
  if (owner.phone && buyer.phone && owner.phone === buyer.phone) return true;
  if (owner.card_fp && buyer.cardFp && owner.card_fp === buyer.cardFp) return true;
  if (owner.ip_cluster && buyer.ipCluster && owner.ip_cluster === buyer.ipCluster) return true;
  return false;
}

async function sumStatus(db, parentId, status) {
  const row = await first(
    db,
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents
       FROM kide_referral_ledger
      WHERE referrer_id = ? AND status = ?`,
    [parentId, status],
  );
  return Number(row && row.cents) || 0;
}

async function syncPayout(db, parentId, nowIso) {
  const available = await sumStatus(db, parentId, "available");
  const open = await first(
    db,
    `SELECT * FROM kide_referral_payouts WHERE parent_id = ? AND status = 'requested'`,
    [parentId],
  );
  if (available >= PAYOUT_AT_CENTS) {
    if (!open) {
      const id = randomId("kide_rq_");
      await run(
        db,
        `INSERT INTO kide_referral_payouts
           (id, parent_id, amount_cents, status, method, live, created_at, updated_at)
         VALUES (?, ?, ?, 'requested', ?, 0, ?, ?)`,
        [id, parentId, available, PAYOUT_METHOD, nowIso, nowIso],
      );
      return { event: "payout_requested", id, amountCents: available };
    }
    if (Number(open.amount_cents) !== available) {
      await run(
        db,
        `UPDATE kide_referral_payouts SET amount_cents = ?, updated_at = ? WHERE id = ?`,
        [available, nowIso, open.id],
      );
    }
    return null;
  }
  if (open) {
    await run(
      db,
      `UPDATE kide_referral_payouts SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
      [nowIso, open.id],
    );
    return { event: "payout_withdrawn", id: open.id, amountCents: available };
  }
  return null;
}

export async function matureLedger(db, now) {
  await ensureReferralSchema(db);
  const nowIso = iso(now);
  await run(
    db,
    `UPDATE kide_referral_ledger
        SET status = 'available', updated_at = ?
      WHERE status = 'pending' AND hold_until <= ?`,
    [nowIso, nowIso],
  );
  const parents = await all(
    db,
    `SELECT DISTINCT referrer_id AS id FROM kide_referral_ledger WHERE status = 'available'`,
  );
  const events = [];
  for (const parent of parents) {
    const change = await syncPayout(db, parent.id, nowIso);
    if (change) events.push({ ...change, parentId: parent.id });
  }
  return events;
}

async function entryByRef(db, purchaseRef) {
  if (!purchaseRef) return null;
  return first(db, `SELECT * FROM kide_referral_ledger WHERE purchase_ref = ?`, [purchaseRef]);
}

export async function recordClearedPurchase(db, input, now) {
  await ensureReferralSchema(db);
  const code = normalizeRef(input && input.code);
  if (!code) return { ok: false, reason: "unknown_code" };
  if (!input || input.offeringId !== FAMILY_OFFERING) return { ok: false, reason: "not_family" };
  const buyerId = typeof input.buyerId === "string" ? input.buyerId : "";
  if (!buyerId) return { ok: false, reason: "buyer" };
  const purchaseRef = typeof input.purchaseRef === "string" && input.purchaseRef.length >= 4 && input.purchaseRef.length <= 180
    ? input.purchaseRef
    : "";
  if (!purchaseRef) return { ok: false, reason: "purchase" };
  const owner = await codeByValue(db, code);
  if (!owner) return { ok: false, reason: "unknown_code" };
  const buyer = {
    parentId: buyerId,
    phone: cleanPhone(input.buyerPhone),
    cardFp: cleanCard(input.buyerCardFp),
    ipCluster: ipCluster(input.buyerIp),
  };
  if (samePerson(owner, buyer)) return { ok: false, reason: "self" };

  const paidAt = typeof input.paidAt === "number" ? input.paidAt : now;
  const nowIso = iso(now);
  const holdUntil = iso(paidAt + HOLD_MS);
  const existing = await entryByRef(db, purchaseRef);
  if (existing && existing.status !== "reversed") {
    const events = await matureLedger(db, now);
    return { ok: true, fresh: false, amountCents: REWARD_CENTS, referrerId: existing.referrer_id, events };
  }
  if (existing && existing.status === "reversed") {
    await run(
      db,
      `UPDATE kide_referral_ledger
          SET status = 'pending', amount_cents = ?, hold_until = ?, updated_at = ?, payout_id = NULL,
              referrer_id = ?, referred_id = ?, code = ?
        WHERE id = ?`,
      [REWARD_CENTS, holdUntil, nowIso, owner.parent_id, buyerId, code, existing.id],
    );
  } else {
    await run(
      db,
      `INSERT INTO kide_referral_ledger
         (id, referrer_id, referred_id, code, purchase_ref, amount_cents, status, hold_until, created_at, updated_at, payout_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`,
      [randomId("kide_rf_"), owner.parent_id, buyerId, code, purchaseRef, REWARD_CENTS, holdUntil, nowIso, nowIso],
    );
  }
  const events = await matureLedger(db, now);
  return { ok: true, fresh: true, amountCents: REWARD_CENTS, referrerId: owner.parent_id, code, events };
}

export async function reverseClearedPurchase(db, { buyerId, purchaseRef }, now) {
  await ensureReferralSchema(db);
  let row = purchaseRef ? await entryByRef(db, purchaseRef) : null;
  if (!row && buyerId) {
    row = await first(
      db,
      `SELECT * FROM kide_referral_ledger
        WHERE referred_id = ? AND status != 'reversed'
        ORDER BY created_at DESC`,
      [buyerId],
    );
  }
  if (!row || row.status === "reversed") {
    return { ok: true, reversed: false, events: [] };
  }
  const nowIso = iso(now);
  await run(
    db,
    `UPDATE kide_referral_ledger SET status = 'reversed', updated_at = ?, payout_id = NULL WHERE id = ?`,
    [nowIso, row.id],
  );
  const events = await matureLedger(db, now);
  const change = await syncPayout(db, row.referrer_id, nowIso);
  if (change) events.push({ ...change, parentId: row.referrer_id });
  return { ok: true, reversed: true, referrerId: row.referrer_id, amountCents: REWARD_CENTS, events };
}

export async function earningsFor(db, parentId, now) {
  await matureLedger(db, now);
  const pendingCents = await sumStatus(db, parentId, "pending");
  const availableCents = await sumStatus(db, parentId, "available");
  const paidCents = await sumStatus(db, parentId, "paid");
  const familiesRow = await first(
    db,
    `SELECT COUNT(*) AS n FROM kide_referral_ledger WHERE referrer_id = ? AND status != 'reversed'`,
    [parentId],
  );
  const code = await codeForParent(db, parentId);
  const open = await first(
    db,
    `SELECT amount_cents FROM kide_referral_payouts WHERE parent_id = ? AND status = 'requested'`,
    [parentId],
  );
  return {
    pendingCents,
    availableCents,
    paidCents,
    families: Number(familiesRow && familiesRow.n) || 0,
    earnedCents: pendingCents + availableCents + paidCents,
    openSendCents: open ? Number(open.amount_cents) || 0 : 0,
    code: code ? code.code : null,
    link: code ? shareLink(code.code) : null,
  };
}

export async function listPayoutQueue(db) {
  await ensureReferralSchema(db);
  return all(
    db,
    `SELECT id, parent_id, amount_cents, status, method, live, created_at
       FROM kide_referral_payouts
      WHERE status = 'requested'
      ORDER BY created_at`,
  );
}
