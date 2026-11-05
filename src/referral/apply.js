// Money path: a cleared $15 family_unlock credits the sharer $6 in the cash
// ledger. Attribution comes only from the hub purchase row (custom_ref +
// stable Stripe/hub id + paid time). The browser kide_ref cookie is not proof.
//
// Hub contract (getCredits). riskfreetrial source was not readable here.
// Until Automator returns these fields on a family purchase, kide will unlock
// play from offering/status but will not credit $6:
//   purchases[].domain = "kide.us"
//   purchases[].offeringId = "family_unlock" OR priceId = live family price
//   purchases[].status = paid | refunded | reversed | canceled | ...
//   purchases[].id | sessionId | paymentIntent | chargeId = cs_|ch_|pi_|in_|py_...
//   purchases[].paidAt | createdAt = ISO or epoch ms (hold starts here)
//   purchases[].metadata.custom_ref = the 8-char code from createCheckout
//     customMetadata.ref (hub copies that to Stripe metadata[custom_ref])
//   optional purchases[].amountCents = 1500 and currency = usd; a present
//     wrong amount blocks the credit
// No new hub method. No Connect. No webhook on this worker.

import { parentIdFor } from "../account/parent-id.js";
import { DOMAIN, OFFERING_ID, STRIPE_PRICE_ID } from "../unlock/config.js";
import { familyPurchaseFacts } from "../unlock/entitlement.js";
import {
  FAMILY_OFFERING,
  PAYOUT_METHOD,
  REWARD_CENTS,
  earningsFor,
  issueCode,
  recordClearedPurchase,
  reverseClearedPurchase,
} from "./ledger.js";

export const SHARE_REWARD =
  "You get $6 when a parent you invite buys family play. It waits 14 days. When those $6 add up to $50, we can ask to send the cash. We do not send it yet.";

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

export async function issueShareCode(env, { parentId, email }) {
  const issued = await issueCode(env.DB, { parentId, email });
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
    purchaseRef: input.purchaseRef,
    paidAt: typeof input.paidAt === "number" ? input.paidAt : null,
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
// The request cookie is ignored. Only hub purchase fields can credit $6.
export async function noteFamilyUnlock(env, _request, email, credits, now) {
  try {
    if (!env || !env.DB || !email) return;
    const facts = familyPurchaseFacts(credits, {
      offeringId: OFFERING_ID,
      priceId: STRIPE_PRICE_ID,
      domain: DOMAIN,
    });
    const buyerId = await parentIdFor("email", email);
    for (const fact of facts) {
      if (fact.state === "refunded") {
        await applyRefund(env, { purchaseRef: fact.purchaseRef, now });
      }
    }
    for (const fact of facts) {
      if (fact.state !== "paid") continue;
      await applyClearedPurchase(env, {
        code: fact.customRef,
        buyerId,
        purchaseRef: fact.purchaseRef,
        paidAt: fact.paidAt,
        now,
        offeringId: OFFERING_ID,
      });
    }
  } catch {
    // Family play stays as the hub reported it.
  }
}

export async function shareStatus(env, parentId, now) {
  if (!env || !env.DB || !parentId) return null;
  return earningsFor(env.DB, parentId, typeof now === "number" ? now : Date.now());
}
