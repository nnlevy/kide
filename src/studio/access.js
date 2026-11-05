// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// The offering may not have a live Stripe price. This module does not create
// one, does not open a checkout, and does not read a practice record.
// Entitlement is hub getCredits purchase history for lesson_studio_monthly.

import { normalizeEmail, DOMAIN as ACCOUNT_DOMAIN } from "../account/channel.js";
import { parentIdFor } from "../account/parent-id.js";
import { ensureParent } from "../account/store.js";
import { purchaseGrantsUnlock } from "../unlock/entitlement.js";

export const DOMAIN = "kide.us";
export const OFFERING_ID = "lesson_studio_monthly";
export const CHECKOUT = "coming_soon";

export const COMING_SOON_MESSAGE =
  "Lesson Studio needs a monthly subscription. Checkout is not open yet — coming soon.";

export const UNKNOWN_MESSAGE =
  "The subscription check did not answer. That is not a no, and this page does not ask you to pay.";

export const REFUSED_MESSAGE =
  "That note cannot be used. Lesson Studio takes an age band and the sounds to practice, and nothing about a child.";

export async function readStudioParent(request, env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.currentSession !== "function") {
    return { parentId: null, email: null };
  }
  let result;
  try {
    result = await messaging.currentSession({
      domain: ACCOUNT_DOMAIN || DOMAIN,
      session: request.headers.get("cookie") || "",
    });
  } catch {
    return { parentId: null, email: null };
  }
  if (!result || result.ok !== true) return { parentId: null, email: null };
  const email = normalizeEmail(result.email);
  if (!email) return { parentId: null, email: null };
  let parentId = await parentIdFor("email", email);
  if (env && env.DB) {
    try {
      parentId = await ensureParent(env.DB, { id: parentId, email, phone: null });
    } catch {
      // The computed id still keys kide_lessons when the parent table cannot be written.
    }
  }
  return { parentId, email };
}

/** known is false when the hub did not answer. That is not "no subscription". */
export async function studioEntitlement(env, email) {
  const billing = env && env.PORTFOLIO_BILLING_SERVICE;
  if (!email || !billing || typeof billing.getCredits !== "function") {
    return { known: false, enabled: false };
  }
  try {
    const credits = await billing.getCredits(email);
    const verdict = purchaseGrantsUnlock(credits, {
      offeringId: OFFERING_ID,
      priceId: "",
      domain: DOMAIN,
    });
    return { known: verdict.known === true, enabled: verdict.unlocked === true };
  } catch {
    return { known: false, enabled: false };
  }
}

export function studioView({ signedIn, entitlement }) {
  const base = { offeringId: OFFERING_ID, checkout: CHECKOUT };
  if (!signedIn) {
    return {
      http: 200,
      body: {
        ...base,
        ok: true,
        enabled: false,
        signedIn: false,
        state: "needs_subscription",
        message: COMING_SOON_MESSAGE,
      },
    };
  }
  if (!entitlement || entitlement.known !== true) {
    return {
      http: 503,
      body: {
        ...base,
        ok: false,
        enabled: false,
        signedIn: true,
        state: "unknown",
        message: UNKNOWN_MESSAGE,
      },
    };
  }
  if (entitlement.enabled !== true) {
    return {
      http: 200,
      body: {
        ...base,
        ok: true,
        enabled: false,
        signedIn: true,
        state: "needs_subscription",
        message: COMING_SOON_MESSAGE,
      },
    };
  }
  return {
    http: 200,
    body: {
      ...base,
      ok: true,
      enabled: true,
      signedIn: true,
      state: "enabled",
      message: "",
    },
  };
}
