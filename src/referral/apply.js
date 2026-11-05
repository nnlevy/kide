// Money path: a cleared $15 family_unlock credits the sharer $6 in the cash
// ledger. The hub is told with notifyReferralActivity. No Connect account is
// opened and no price is created.

import { parentIdFor } from "../account/parent-id.js";
import { DOMAIN, OFFERING_ID, STRIPE_PRICE_ID } from "../unlock/config.js";
import { familyPurchaseFact } from "../unlock/entitlement.js";
import {
  FAMILY_OFFERING,
  PAYOUT_METHOD,
  REWARD_CENTS,
  earningsFor,
  issueCode,
  recordClearedPurchase,
  reverseClearedPurchase,
} from "./ledger.js";
import { refFromRequest } from "./ref.js";

export const SHARE_REWARD =
  "You get $6 when a parent you invite buys family play. It waits 14 days, then we can send it. At $50, we send it.";

const HUB_TIMEOUT_MS = 1500;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), HUB_TIMEOUT_MS)),
  ]);
}

export async function notifyReferral(env, event) {
  const hub = env && env.PORTFOLIO_BILLING_SERVICE;
  if (!hub || typeof hub.notifyReferralActivity !== "function") return;
  try {
    await withTimeout(hub.notifyReferralActivity({
      domain: DOMAIN,
      source: "kide_referral_ledger",
      live: false,
      method: PAYOUT_METHOD,
      ...event,
    }));
  } catch {
    // The ledger row is already written. The hub can hear about it later.
  }
}

function clientIp(request) {
  if (!request || !request.headers) return null;
  return request.headers.get("cf-connecting-ip");
}

export async function issueShareCode(env, { parentId, email, phone, cardFp, request }) {
  const issued = await issueCode(env.DB, {
    parentId,
    email,
    phone,
    cardFp,
    ip: clientIp(request),
  });
  if (!issued) return null;
  if (issued.fresh) {
    await notifyReferral(env, { event: "code_issued", code: issued.code, parentId });
  }
  return { ...issued, reward: SHARE_REWARD };
}

async function fanOut(env, events) {
  for (const event of events || []) {
    await notifyReferral(env, {
      event: event.event,
      parentId: event.parentId,
      amountCents: event.amountCents,
      payoutId: event.id,
    });
  }
}

export async function applyClearedPurchase(env, input) {
  if (!env || !env.DB) return { ok: false, reason: "no_ledger" };
  const now = typeof input.now === "number" ? input.now : Date.now();
  const result = await recordClearedPurchase(env.DB, {
    code: input.code,
    buyerId: input.buyerId,
    buyerPhone: input.buyerPhone,
    buyerCardFp: input.buyerCardFp,
    buyerIp: input.buyerIp,
    purchaseRef: input.purchaseRef,
    paidAt: typeof input.paidAt === "number" ? input.paidAt : now,
    offeringId: input.offeringId || FAMILY_OFFERING,
  }, now);
  if (result.ok && result.fresh) {
    await notifyReferral(env, {
      event: "pending",
      code: result.code,
      parentId: result.referrerId,
      amountCents: REWARD_CENTS,
      purchaseRef: input.purchaseRef,
    });
  } else if (!result.ok && result.reason === "self") {
    await notifyReferral(env, { event: "self_blocked", code: input.code, parentId: input.buyerId });
  }
  if (result.ok) await fanOut(env, result.events);
  return result;
}

export async function applyRefund(env, input) {
  if (!env || !env.DB) return { ok: false, reason: "no_ledger" };
  const now = typeof input.now === "number" ? input.now : Date.now();
  const result = await reverseClearedPurchase(env.DB, {
    buyerId: input.buyerId,
    purchaseRef: input.purchaseRef,
  }, now);
  if (result.reversed) {
    await notifyReferral(env, {
      event: "reversed",
      parentId: result.referrerId,
      amountCents: result.amountCents,
      purchaseRef: input.purchaseRef,
    });
    await fanOut(env, result.events);
  }
  return result;
}

// Called when purchase history says family play cleared, or a refund landed.
// A missing database does nothing. A thrown error does not un-pay the family.
export async function noteFamilyUnlock(env, request, email, credits, now) {
  try {
    if (!env || !env.DB || !email) return;
    const fact = familyPurchaseFact(credits, {
      offeringId: OFFERING_ID,
      priceId: STRIPE_PRICE_ID,
      domain: DOMAIN,
    });
    const buyerId = await parentIdFor("email", email);
    const purchaseRef = fact.purchaseRef || `family_unlock:${email}`;
    if (fact.state === "paid") {
      const code = request ? refFromRequest(request) : null;
      if (!code) return;
      await applyClearedPurchase(env, {
        code,
        buyerId,
        buyerPhone: fact.phone,
        buyerCardFp: fact.cardFp,
        buyerIp: clientIp(request),
        purchaseRef,
        paidAt: now,
        now,
        offeringId: OFFERING_ID,
      });
      return;
    }
    if (fact.state === "refunded") {
      await applyRefund(env, { buyerId, purchaseRef, now });
    }
  } catch {
    // Family play stays as the hub reported it.
  }
}

export async function shareStatus(env, parentId, now) {
  if (!env || !env.DB || !parentId) return null;
  return earningsFor(env.DB, parentId, typeof now === "number" ? now : Date.now());
}
