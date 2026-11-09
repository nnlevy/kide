// Family play is entitled when purchase history names this offering.
// Domain-wide credit totals are the clinician licence signal and are not
// reused here, so a licence purchase does not open family play and a family
// purchase is not inferred from a bare credit count.

// Confirmed money captured. Pending, open, blank, and unfinished checkouts
// are not grants. Refunded and failed are not grants either.
const PAID = new Set(["paid", "succeeded", "complete", "completed"]);

const PURCHASE_ID_KEYS = [
  "id", "purchaseId", "paymentId", "sessionId", "checkoutSessionId",
  "stripeSessionId", "chargeId", "paymentIntentId", "invoiceId", "payment_intent",
];

function isConfirmedPaid(row) {
  const status = String(row.status ?? row.state ?? "").trim().toLowerCase();
  return PAID.has(status);
}

// Stable per purchase. An explicit id wins. Without one, the offering, price,
// time, and amount still keep two different receipts apart, and a repeat of
// the same receipt stays one purchase.
function purchaseIdentity(row) {
  for (const key of PURCHASE_ID_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return `${key}:${value.trim().slice(0, 200)}`;
    if (typeof value === "number" && Number.isFinite(value)) return `${key}:${value}`;
  }
  const created = row.createdAt || row.created || row.paidAt || row.at || "";
  const amount = row.amountCents ?? row.amount ?? "";
  return `row:${namesOf(row).slice().sort().join(",")}|${created}|${amount}`;
}

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

/**
 * Confirmed paid purchases of this offering, one key each. Pending, open,
 * and blank rows are omitted. The key is what the paid-step counter stores
 * so the same purchase is never counted twice.
 */
export function confirmedPurchaseKeys(credits, { offeringId, priceId, domain }) {
  if (!credits || credits.ok !== true) return [];
  const keys = [];
  const seen = new Set();
  for (const row of rowsOf(credits)) {
    if (!row || typeof row !== "object") continue;
    if (row.domain && row.domain !== domain) continue;
    if (!isConfirmedPaid(row)) continue;
    const names = namesOf(row);
    if (!(names.includes(offeringId) || (priceId && names.includes(priceId)))) continue;
    const key = purchaseIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * @returns {{ known: boolean, unlocked: boolean }}
 * known is false when the hub did not answer. That is not a "no".
 * unlocked is true only when a confirmed paid purchase names this offering.
 */
export function purchaseGrantsUnlock(credits, cfg) {
  if (!credits || credits.ok !== true) return { known: false, unlocked: false };
  return { known: true, unlocked: confirmedPurchaseKeys(credits, cfg).length > 0 };
}

export function unlockKey(email) {
  return `kide:family-unlock:v1:${email}`;
}

export function deviceUnlockKey(deviceId) {
  return `kide:family-unlock:v1:device:${deviceId}`;
}
