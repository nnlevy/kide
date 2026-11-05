// Family play is entitled when purchase history names this offering.
// Domain-wide credit totals are the clinician licence signal and are not
// reused here, so a licence purchase does not open family play and a family
// purchase is not inferred from a bare credit count.

import { AMOUNT_CENTS } from "./config.js";
import { normalizeRef } from "../referral/ref.js";

const REFUND = new Set(["refunded", "reversed", "canceled", "cancelled", "failed", "unpaid"]);
const PURCHASE_REF = /^(cs_|ch_|pi_|in_|py_)[A-Za-z0-9_]+$/;

function rowsOf(credits) {
  const out = [];
  for (const key of ["purchases", "history", "ledger", "items", "orders", "summaries"]) {
    const list = credits[key];
    if (Array.isArray(list)) out.push(...list);
  }
  return out;
}

function namesOf(row) {
  const names = [];
  for (const key of ["offeringId", "offering", "priceId", "price", "sku", "product", "productId", "lookupKey"]) {
    if (typeof row[key] === "string" && row[key]) names.push(row[key]);
  }
  const meta = row.metadata;
  if (meta && typeof meta === "object") {
    for (const key of ["offeringId", "priceId", "price"]) {
      if (typeof meta[key] === "string" && meta[key]) names.push(meta[key]);
    }
  }
  return names;
}

function familyRow(row, { offeringId, priceId, domain }) {
  if (!row || typeof row !== "object") return false;
  if (row.domain && row.domain !== domain) return false;
  const names = namesOf(row);
  return names.includes(offeringId) || (priceId && names.includes(priceId));
}

export function isStablePurchaseRef(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 180 && PURCHASE_REF.test(value);
}

export function purchaseRefOf(row) {
  if (!row || typeof row !== "object") return null;
  for (const key of ["id", "purchaseId", "sessionId", "paymentIntent", "chargeId"]) {
    if (isStablePurchaseRef(row[key])) return row[key];
  }
  return null;
}

export function customRefOf(row) {
  if (!row || typeof row !== "object") return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return normalizeRef(
    row.custom_ref || row.customRef || meta.custom_ref || meta.customRef || meta.ref,
  );
}

export function paidAtOf(row) {
  if (!row || typeof row !== "object") return null;
  for (const key of ["paidAt", "paid_at", "createdAt", "created_at", "purchasedAt"]) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 1e11) return Math.floor(value);
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

function amountMatches(row) {
  if (!row || typeof row !== "object") return true;
  const cents = Number(row.amountCents ?? row.amount_cents);
  if (Number.isFinite(cents) && cents > 0) return cents === AMOUNT_CENTS;
  const amount = Number(row.amount);
  if (Number.isFinite(amount) && amount > 0) {
    return amount === AMOUNT_CENTS || amount === AMOUNT_CENTS / 100;
  }
  const currency = typeof row.currency === "string" ? row.currency.trim().toLowerCase() : "";
  if (currency && currency !== "usd") return false;
  return true;
}

function statusOf(row) {
  return String(row.status || row.state || "").toLowerCase();
}

/**
 * @returns {{ known: boolean, unlocked: boolean }}
 * known is false when the hub did not answer. That is not a "no".
 * A refunded row for a purchase beats a paid row for the same id.
 * Rows with no stable id share one bucket: any refund there beats a paid row.
 */
export function purchaseGrantsUnlock(credits, cfg) {
  if (!credits || credits.ok !== true) return { known: false, unlocked: false };
  const groups = new Map();
  for (const row of rowsOf(credits)) {
    if (!familyRow(row, cfg)) continue;
    const key = purchaseRefOf(row) || "_noid_";
    const refunded = REFUND.has(statusOf(row));
    const prev = groups.get(key) || { paid: false, refunded: false };
    if (refunded) prev.refunded = true;
    else prev.paid = true;
    groups.set(key, prev);
  }
  let unlocked = false;
  for (const group of groups.values()) {
    if (group.paid && !group.refunded) unlocked = true;
  }
  return { known: true, unlocked };
}

/**
 * Trusted family-purchase rows for the cash ledger.
 * A row can unlock play and still be omitted here: missing id, paid time,
 * or custom_ref means the hub has not given enough to credit $6.
 */
export function familyPurchaseFacts(credits, cfg) {
  if (!credits || credits.ok !== true) return [];
  const groups = new Map();
  for (const row of rowsOf(credits)) {
    if (!familyRow(row, cfg)) continue;
    const purchaseRef = purchaseRefOf(row);
    if (!purchaseRef) continue;
    const refunded = REFUND.has(statusOf(row));
    const prev = groups.get(purchaseRef) || {
      purchaseRef,
      customRef: null,
      paidAt: null,
      amountOk: true,
      paid: false,
      refunded: false,
    };
    if (refunded) prev.refunded = true;
    else prev.paid = true;
    prev.customRef = prev.customRef || customRefOf(row);
    prev.paidAt = prev.paidAt || paidAtOf(row);
    prev.amountOk = prev.amountOk && amountMatches(row);
    groups.set(purchaseRef, prev);
  }
  const out = [];
  for (const fact of groups.values()) {
    if (fact.refunded) {
      out.push({
        state: "refunded",
        purchaseRef: fact.purchaseRef,
        customRef: fact.customRef,
        paidAt: fact.paidAt,
      });
      continue;
    }
    if (fact.paid && fact.customRef && fact.paidAt && fact.amountOk) {
      out.push({
        state: "paid",
        purchaseRef: fact.purchaseRef,
        customRef: fact.customRef,
        paidAt: fact.paidAt,
      });
    }
  }
  return out;
}

export function unlockKey(email) {
  return `kide:family-unlock:v1:${email}`;
}

export function deviceUnlockKey(deviceId) {
  return `kide:family-unlock:v1:device:${deviceId}`;
}
