// Family play is entitled when purchase history names an allowlisted offering.
// Domain-wide credit totals are the clinician licence signal and are not
// reused here, so a licence purchase does not open family play and a family
// purchase is not inferred from a bare credit count.
//
// Offering ids are a closed list. A row that names a different offering does
// not grant family play, even when it also carries the family price. A row
// with no offering id can still grant play when it names that price or the
// allowlisted id under another hub field. That is the equivalent of purchases[].

const REFUND = new Set(["refunded", "reversed", "canceled", "cancelled", "failed", "unpaid"]);

// Ids that may call setUnlock. clinician_report is intentionally absent.
export const UNLOCK_OFFERING_IDS = Object.freeze(["family_unlock"]);

export function isAllowlistedOffering(id) {
  return typeof id === "string" && UNLOCK_OFFERING_IDS.includes(id);
}

function rowsOf(credits) {
  const out = [];
  for (const key of ["purchases", "history", "ledger", "items", "orders", "summaries"]) {
    const list = credits[key];
    if (Array.isArray(list)) out.push(...list);
  }
  return out;
}

function field(row, keys) {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) return row[key];
  }
  const meta = row.metadata;
  if (meta && typeof meta === "object") {
    for (const key of keys) {
      if (typeof meta[key] === "string" && meta[key]) return meta[key];
    }
  }
  return "";
}

function offeringOf(row) {
  return field(row, ["offeringId", "offering"]);
}

function priceOf(row) {
  return field(row, ["priceId", "price"]);
}

// True when this row is the family offering, or the same purchase under a
// price / sku the hub used instead of offeringId. A named non-allowlisted
// offering is never family play.
function namesFamily(row, priceId) {
  const offering = offeringOf(row);
  if (isAllowlistedOffering(offering)) return true;
  if (offering && offering !== priceId) return false;
  if (priceId && priceOf(row) === priceId) return true;
  const alias = field(row, ["sku", "product", "productId", "lookupKey"]);
  if (isAllowlistedOffering(alias)) return true;
  if (priceId && (alias === priceId || offering === priceId)) return true;
  return false;
}

/**
 * @returns {{ known: boolean, unlocked: boolean }}
 * known is false when the hub did not answer. That is not a "no".
 */
export function purchaseGrantsUnlock(credits, { offeringId, priceId, domain } = {}) {
  if (offeringId && !isAllowlistedOffering(offeringId)) return { known: true, unlocked: false };
  if (!credits || credits.ok !== true) return { known: false, unlocked: false };
  for (const row of rowsOf(credits)) {
    if (!row || typeof row !== "object") continue;
    if (row.domain && row.domain !== domain) continue;
    if (!namesFamily(row, priceId)) continue;
    const status = String(row.status || row.state || "").toLowerCase();
    if (REFUND.has(status)) continue;
    return { known: true, unlocked: true };
  }
  return { known: true, unlocked: false };
}

export function unlockKey(email) {
  return `kide:family-unlock:v1:${email}`;
}

export function deviceUnlockKey(deviceId) {
  return `kide:family-unlock:v1:device:${deviceId}`;
}
