// Family play is entitled only by a getCredits purchase receipt.
// The receipt is {domain, offeringId, sourceRef, status}. sourceRef is the
// Stripe Checkout session id (cs_live_ / cs_test_), not purchases.id and not
// the offering id. Summaries, price ids, and sku aliases are not a receipt.

const REFUND = new Set(["refunded", "reversed", "canceled", "cancelled", "failed", "unpaid"]);
const GRANT = new Set(["paid", "fulfilled"]);

// Stripe Checkout session ids. A numeric purchases.id cannot pass.
const CHECKOUT_SESSION = /^cs_(live|test)_[A-Za-z0-9]{10,180}$/;

export const UNLOCK_OFFERING_IDS = Object.freeze(["family_unlock"]);

export function isAllowlistedOffering(id) {
  return typeof id === "string" && UNLOCK_OFFERING_IDS.includes(id);
}

export function checkoutSessionId(value) {
  return typeof value === "string" && CHECKOUT_SESSION.test(value) ? value : "";
}

/**
 * @returns {{ known: boolean, unlocked: boolean, sourceRef: string }}
 * known is false when the hub did not answer. That is not a "no".
 * A refunded row for a Checkout session wins over a paid row with the same id.
 * A different Checkout session that is still paid keeps the unlock.
 */
export function purchaseGrantsUnlock(credits, { offeringId, domain } = {}) {
  const none = { known: false, unlocked: false, sourceRef: "" };
  if (offeringId && !isAllowlistedOffering(offeringId)) {
    return { known: true, unlocked: false, sourceRef: "" };
  }
  if (!credits || credits.ok !== true) return none;
  // A missing purchases array is not an empty receipt. Empty means the hub
  // answered and listed none. Missing means we do not know, so the caller
  // keeps the current session's stored unlock.
  if (!Array.isArray(credits.purchases)) return none;
  const sessions = new Map();
  for (const row of credits.purchases) {
    if (!row || typeof row !== "object") continue;
    if (row.domain !== domain) continue;
    if (row.offeringId !== offeringId) continue;
    const sourceRef = checkoutSessionId(row.sourceRef);
    if (!sourceRef) continue;
    const status = String(row.status || "").toLowerCase();
    const prev = sessions.get(sourceRef) || { paid: false, revoked: false };
    if (REFUND.has(status)) prev.revoked = true;
    else if (GRANT.has(status)) prev.paid = true;
    sessions.set(sourceRef, prev);
  }
  for (const [sourceRef, state] of sessions) {
    if (state.paid && !state.revoked) {
      return { known: true, unlocked: true, sourceRef };
    }
  }
  return { known: true, unlocked: false, sourceRef: "" };
}

export function unlockKey(email) {
  return `kide:family-unlock:v1:${email}`;
}

export function deviceUnlockKey(deviceId) {
  return `kide:family-unlock:v1:device:${deviceId}`;
}

const DEVICE_RE = /^[A-Za-z0-9_-]{22,80}$/;

export function deviceIdFromCookie(request) {
  const raw = request && request.headers ? request.headers.get("cookie") || "" : "";
  const match = raw.match(/(?:^|;\s*)kide_device=([A-Za-z0-9_-]{22,80})/);
  return match && DEVICE_RE.test(match[1]) ? match[1] : "";
}

// Logout and every unlock read drop this key. It is not a paid identity.
export async function dropDeviceUnlock(kv, deviceId) {
  if (!kv || typeof kv.delete !== "function" || !deviceId) return;
  await kv.delete(deviceUnlockKey(deviceId));
}
