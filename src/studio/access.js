// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Checkout stays closed. getCredits history/purchases/summaries never grant
// monthly access. Family unlock's one-time matcher is not used here.
//
// Additive seam for the hub owner (riskfreetrial PortfolioBillingService):
// this repo's implemented getCredits type is
// { ok, exists, email, creditsBalance, summaries?: { domain, creditsPurchased } }.
// That shape has no current period. Hub source was not available in this
// checkout. When a current-period reader exists, pass its snapshot to
// currentMonthlySubscription(). Required fields, all present or access is
// denied: ok===true, domain===kide.us, offeringId===lesson_studio_monthly,
// status in {active, trialing}, currentPeriodEnd (ISO) in the future.
// cancelAtPeriodEnd may be true only while that end is still in the future.
// canceled, cancelled, expired, incomplete, past_due, unpaid, failed,
// refunded, reversed, and a missing/unparseable period never grant.

import { normalizeEmail, DOMAIN as ACCOUNT_DOMAIN } from "../account/channel.js";
import { parentIdFor } from "../account/parent-id.js";
import { ensureParent } from "../account/store.js";

export const DOMAIN = "kide.us";
export const OFFERING_ID = "lesson_studio_monthly";
export const CHECKOUT = "coming_soon";

export const COMING_SOON_MESSAGE =
  "Lesson Studio is not open for new lessons yet. This page does not ask you to pay.";

export const UNKNOWN_MESSAGE =
  "We could not check just now. Try again in a little while. This page does not ask you to pay.";

export const REFUSED_MESSAGE =
  "That note cannot be used. Pick an age band and the sounds to practice.";

export const CHILD_ASK_GROWNUP = "Ask a grown-up. Nothing is ready to play yet.";
export const CHILD_EMPTY = "Nothing here yet. A grown-up picks one first.";

const DENIED_STATUS = new Set([
  "canceled",
  "cancelled",
  "expired",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "unpaid",
  "failed",
  "refunded",
  "reversed",
]);

const LIVE_STATUS = new Set(["active", "trialing"]);

function periodEndMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Current monthly grant from an explicit period snapshot.
 * getCredits rows are not this snapshot and must not be passed here.
 */
export function currentMonthlySubscription(snapshot, { offeringId = OFFERING_ID, domain = DOMAIN, now = Date.now() } = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { known: false, enabled: false };
  }
  if (snapshot.ok !== true) return { known: false, enabled: false };
  if (snapshot.domain && snapshot.domain !== domain) return { known: true, enabled: false };
  if (snapshot.offeringId !== offeringId) return { known: true, enabled: false };
  const status = String(snapshot.status || snapshot.state || "").toLowerCase();
  if (!status || DENIED_STATUS.has(status) || !LIVE_STATUS.has(status)) {
    return { known: true, enabled: false };
  }
  const end = periodEndMs(snapshot.currentPeriodEnd ?? snapshot.current_period_end);
  if (end == null || end <= now) return { known: true, enabled: false };
  return { known: true, enabled: true };
}

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
    if (!credits || credits.ok !== true) return { known: false, enabled: false };
    // Hub answered. History is not a current-period contract. Monthly stays closed.
    if (env && env.STUDIO_MONTHLY_SNAPSHOT) {
      return currentMonthlySubscription(env.STUDIO_MONTHLY_SNAPSHOT, {
        offeringId: OFFERING_ID,
        domain: DOMAIN,
      });
    }
    return { known: true, enabled: false };
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
        state: "closed",
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
        state: "closed",
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
