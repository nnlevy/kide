// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Checkout stays closed. getCredits summaries and purchase receipts never
// grant a month. Family unlock's one-time matcher is not used here.
//
// PortfolioBillingService has no parent-scoped current-period reader. The
// hub table portfolio_subscriptions can store a period, and that storage is
// not this function. A normal deploy therefore leaves generation closed
// after a successful getCredits. STUDIO_MONTHLY_SNAPSHOT is ignored so one
// object cannot entitle every family.
//
// Tests may pass env.STUDIO_MONTHLY_FIXTURE = { testOnly: true, records },
// a map of normalized email to one record. The record grants only when its
// email is the signed-in parent, domain is kide.us, and offeringId is
// lesson_studio_monthly. A missing owner, a missing domain, another
// parent's record, or a different offering does not grant. This fixture is
// not a deployed binding and is not set in wrangler.json.
//
// Required on a granting record, all present: ok===true, email of this
// parent, domain===kide.us, offeringId===lesson_studio_monthly, status in
// {active, trialing}, currentPeriodEnd (ISO) in the future.
// cancelAtPeriodEnd may be true only while that end is still in the future.
// canceled, cancelled, expired, incomplete, past_due, unpaid, failed,
// refunded, reversed, and a missing or unparseable period never grant.

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
 * Current monthly grant for one already authenticated parent.
 * getCredits rows are not this record and must not be passed here.
 * email is that parent's address. A record without the same email, or
 * without domain kide.us, does not grant.
 */
export function currentMonthlySubscription(snapshot, { offeringId = OFFERING_ID, domain = DOMAIN, email, now = Date.now() } = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { known: false, enabled: false };
  }
  if (snapshot.ok !== true) return { known: false, enabled: false };
  const parent = normalizeEmail(email);
  const owner = normalizeEmail(snapshot.email);
  if (!parent || !owner || parent !== owner) return { known: true, enabled: false };
  if (snapshot.domain !== domain) return { known: true, enabled: false };
  if (snapshot.offeringId !== offeringId) return { known: true, enabled: false };
  const status = String(snapshot.status || snapshot.state || "").toLowerCase();
  if (!status || DENIED_STATUS.has(status) || !LIVE_STATUS.has(status)) {
    return { known: true, enabled: false };
  }
  const end = periodEndMs(snapshot.currentPeriodEnd ?? snapshot.current_period_end);
  if (end == null || end <= now) return { known: true, enabled: false };
  return { known: true, enabled: true };
}

function fixtureRecord(env, email) {
  const fixture = env && env.STUDIO_MONTHLY_FIXTURE;
  if (!fixture || fixture.testOnly !== true) return null;
  const records = fixture.records;
  if (!records || typeof records !== "object" || Array.isArray(records)) return null;
  const key = normalizeEmail(email);
  if (!key || !Object.prototype.hasOwnProperty.call(records, key)) return null;
  const record = records[key];
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  return record;
}

const SIGNED_OUT = { parentId: null, email: null, identity: "signed_out" };
const IDENTITY_DOWN = { parentId: null, email: null, identity: "unavailable" };

/**
 * Email from PortfolioMessagingService.currentSession only.
 * Source (packet a686eaa passkey.ts, byte-identical to the packet's 1a75001
 * copy; that equality is not a deployment proof): currentSession reads
 * { domain, session } where session is a raw token or a Cookie header, and
 * returns { ok:true, email }, { ok:false }, or { ok:false, error:"storage_error" }.
 * It does not read this request itself and it does not return a parent role,
 * a family, a verifiedParentEmail flag, or a monthly period.
 * The local parent id is kide's owner key for kide_lessons. It is not a hub
 * attestation. A 15-minute login_session expiry deletes that hub row on read;
 * it does not purge lessons here. Missing method, throw, and storage_error
 * are identity unavailable: no owner, no delete, no playback.
 */
export async function readStudioParent(request, env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.currentSession !== "function") return { ...IDENTITY_DOWN };
  let result;
  try {
    result = await messaging.currentSession({
      domain: ACCOUNT_DOMAIN || DOMAIN,
      session: request.headers.get("cookie") || "",
    });
  } catch {
    return { ...IDENTITY_DOWN };
  }
  if (!result || result.ok !== true) {
    if (result && result.error === "storage_error") return { ...IDENTITY_DOWN };
    return { ...SIGNED_OUT };
  }
  const email = normalizeEmail(result.email);
  if (!email) return { ...SIGNED_OUT };
  let parentId = await parentIdFor("email", email);
  if (env && env.DB) {
    try {
      parentId = await ensureParent(env.DB, { id: parentId, email, phone: null });
    } catch {
      // The computed id still keys kide_lessons when the parent table cannot be written.
    }
  }
  return { parentId, email, identity: "ready" };
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
    // Hub answered. Receipts and summaries are not a current period.
    // A process-wide snapshot is not read. Generation stays closed unless a
    // test-only record names this same parent.
    const record = fixtureRecord(env, email);
    if (record) {
      return currentMonthlySubscription(record, {
        offeringId: OFFERING_ID,
        domain: DOMAIN,
        email,
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
