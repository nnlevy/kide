// Family play is entitled when purchase history names this offering.
// Domain-wide credit totals are the clinician licence signal and are not
// reused here, so a licence purchase does not open family play and a family
// purchase is not inferred from a bare credit count.

const REFUND = new Set(["refunded", "reversed", "canceled", "cancelled", "failed", "unpaid"]);

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
 * @returns {{ known: boolean, unlocked: boolean }}
 * known is false when the hub did not answer. That is not a "no".
 */
export function purchaseGrantsUnlock(credits, { offeringId, priceId, domain }) {
  if (!credits || credits.ok !== true) return { known: false, unlocked: false };
  for (const row of rowsOf(credits)) {
    if (!row || typeof row !== "object") continue;
    if (row.domain && row.domain !== domain) continue;
    const status = String(row.status || row.state || "").toLowerCase();
    if (REFUND.has(status)) continue;
    const names = namesOf(row);
    if (names.includes(offeringId) || (priceId && names.includes(priceId))) {
      return { known: true, unlocked: true };
    }
  }
  return { known: true, unlocked: false };
}

export function unlockKey(email) {
  return `kide:family-unlock:v1:${email}`;
}

export function deviceUnlockKey(deviceId) {
  return `kide:family-unlock:v1:device:${deviceId}`;
}
