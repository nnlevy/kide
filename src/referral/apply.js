// Money path: visit → share → $15 family_unlock checkout → intended $6 cash
// at a $50 send threshold via Stripe Connect. This leaf does not keep a cash
// ledger and does not reconstruct commissions from getCredits, cookies,
// sourceRef, or an invented paidAt.
//
// Callable PortfolioBillingService RPCs (packet v2, a686eaa source, not live):
//   issueCashReferralCode({ domain, email, label? })
//     → { ok:true, code, link, rewardLabel } | { ok:false, reason }
//   getCashReferralStatus({ domain, email })
//     → { ok, code, link, families, earnedCents, paidCents, rewardLabel }
//     SUM of stored held|paid rows only. No Stripe, no sync, no refund void.
//   notifyReferralActivity({ domain, code, step: link_open|checkout_open,
//     device?, at?, opens?, checkouts?, paid? }) → { ok:true } | { ok:false, reason }
//   getCashReferrerPublic({ domain, code, claim? })
//   claimCashReferrer({ domain, code, claim, email })
// recordCashReferralFromCheckout and syncCashReferralPayouts are INTERNAL
// exports, not binding methods. Sync voids HELD refunded rows only, not paid.
// Hub created_at / 30-day eligible_at are processing nowIso, not buyer paidAt.
// Hub paid_at is owner-confirmed payout time, not purchase time.
// getCredits receipts are { domain, offeringId, sourceRef, status } only.
// Billing receipt metadata_json has no custom_ref. Attribution is the hub
// Stripe-session-metadata path inside recordCashReferralFromCheckout.
//
// Approved terms (Nir, 31 Oct; AGENTS omission is not revocation):
//   $6 per referred family_unlock, $50 send threshold, Stripe Connect.
// Hub kide program source: defaultPayoutCents 500, holdDays 30, owner queue,
// rewardLabel "$5 for you when a family you shared with buys family play".
// That mismatch is a shared-platform engineering gap, not permission to
// downgrade. Fourteen days was only a proposal. This leaf fail-closes cash
// balances and never treats hub $5 rows as the approved journey completed.
// Live hub 1a75001 unpublished. No Connect. No payouts. No hub edits.
//
// Storage this leaf actually touches for share: the 30-day kide_ref cookie,
// checkout customMetadata.ref, and the five RPCs above (hub stores referrer
// email/code). It does not write kide_referral_* as a second cash authority.
// 10409 owns auth/funnel: issue/status use a server-verified parent email.

import { DOMAIN } from "../unlock/config.js";
import { httpsUrl } from "../unlock/checkout.js";
import { normalizeRef } from "./ref.js";

export const SHARE_REWARD =
  "You get $6 when a parent you invite buys family play. When those $6 add up to $50, we can ask to send the cash. We do not send it yet.";

export const CASH_CLOSED =
  "Your link is yours to share. Cash is not open yet. We do not send it yet.";

const ACTIVITY_STEPS = new Set(["link_open", "checkout_open"]);
const HUB_TIMEOUT_MS = 1500;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), HUB_TIMEOUT_MS)),
  ]);
}

function billingOf(env) {
  return env && env.PORTFOLIO_BILLING_SERVICE ? env.PORTFOLIO_BILLING_SERVICE : null;
}

function shareLinkOf(code, link) {
  const fromHub = httpsUrl(link);
  if (fromHub) return fromHub;
  const normalized = normalizeRef(code);
  return normalized ? `https://kide.us/?ref=${normalized}` : null;
}

// Hub $5 / 30-day / owner-queue is not the approved $6 / $50 / Connect journey.
// Status also does not reconcile refunds or prove webhook freshness. Always
// fail-closed on money. A matching future program still needs a reviewed hub
// change before this leaf may surface cents.
export function approvedProgram(stats) {
  if (!stats || stats.ok !== true) return false;
  const label = String(stats.rewardLabel || "");
  if (/\$5\b/.test(label) || /\b5 for /i.test(label)) return false;
  return false;
}

export function closedCash(extra = {}) {
  return {
    ok: true,
    closed: true,
    pendingCents: 0,
    availableCents: 0,
    paidCents: 0,
    families: 0,
    earnedCents: 0,
    openSendCents: 0,
    link: extra.link || null,
    code: extra.code || null,
    reward: extra.reward || "",
    message: extra.message || CASH_CLOSED,
  };
}

export async function notifyReferralActivity(env, { code, step, device, at } = {}) {
  const hub = billingOf(env);
  if (!hub || typeof hub.notifyReferralActivity !== "function") {
    return { ok: false, reason: "no_hub" };
  }
  const normalized = normalizeRef(code);
  if (!normalized) return { ok: false, reason: "code_required" };
  if (!ACTIVITY_STEPS.has(step)) return { ok: false, reason: "step_unknown" };
  const input = { domain: DOMAIN, code: normalized, step };
  if (device === "phone" || device === "tablet" || device === "computer") input.device = device;
  if (typeof at === "string" && at) input.at = at;
  try {
    const out = await withTimeout(hub.notifyReferralActivity(input));
    if (!out || out.ok !== true) return { ok: false, reason: (out && out.reason) || "notify_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "notify_failed" };
  }
}

export async function lookupPublicCode(env, code, claim) {
  const hub = billingOf(env);
  if (!hub || typeof hub.getCashReferrerPublic !== "function") {
    return { ok: false, reason: "no_hub" };
  }
  const normalized = normalizeRef(code);
  if (!normalized) return { ok: false, reason: "code_required" };
  try {
    const input = { domain: DOMAIN, code: normalized };
    if (claim) input.claim = claim;
    const out = await withTimeout(hub.getCashReferrerPublic(input));
    if (!out || out.ok !== true) return { ok: false, reason: (out && out.reason) || "lookup_failed" };
    return out;
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

export async function issueShareCode(env, { email } = {}) {
  const hub = billingOf(env);
  if (!hub || typeof hub.issueCashReferralCode !== "function") return null;
  const want = typeof email === "string" && email.includes("@") ? email : "";
  if (!want) return null;
  try {
    const issued = await withTimeout(hub.issueCashReferralCode({ domain: DOMAIN, email: want }));
    if (!issued || issued.ok !== true) return null;
    const code = normalizeRef(issued.code);
    const link = shareLinkOf(code, issued.link);
    if (!code || !link) return null;
    return { code, link, reward: SHARE_REWARD, fresh: true };
  } catch {
    return null;
  }
}

export async function shareStatus(env, { email } = {}) {
  const hub = billingOf(env);
  if (!hub || typeof hub.getCashReferralStatus !== "function") return null;
  const want = typeof email === "string" && email.includes("@") ? email : "";
  if (!want) return null;
  try {
    const stats = await withTimeout(hub.getCashReferralStatus({ domain: DOMAIN, email: want }));
    if (!stats || stats.ok !== true) return null;
    const code = normalizeRef(stats.code);
    const link = shareLinkOf(code, stats.link);
    return closedCash({
      link,
      code,
      reward: link ? SHARE_REWARD : "",
      message: CASH_CLOSED,
    });
  } catch {
    return null;
  }
}

// Play unlock uses getCredits. Cash attribution is hub-internal
// recordCashReferralFromCheckout (not an RPC). Do not invent $6 here.
export async function noteFamilyUnlock() {
  return;
}
