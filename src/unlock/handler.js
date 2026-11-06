// Money path: visit → tool use (Pip play) → signup → paid step → Stripe.
//
// Family play reuses PORTFOLIO_BILLING_SERVICE createCheckout and getCredits.
// The buyer email is the one currentSession returns for this browser's
// Cookie header ({ ok: true, email }). The request body is not that identity.
// That result is an email session, not a parent role and not a payment.
// A payment is a later getCredits receipt. storage_error is an outage:
// checkout stays closed and the stored unlock is left in place.
// This leaf does not write the hub purchases table. writeVerifiedPurchase
// inserts status paid and is idempotent on the Stripe session id. Its
// receiptMetadata is eventId, offeringId, offeringKind, mode, and
// subscriptionId. custom_ref is not in that object.
// A Checkout session id from purchases[].sourceRef is what setUnlock stores.
// This file does not talk to Stripe and does not send email.

import {
  COUNTDOWN_SECONDS,
  DOMAIN,
  FREE_PLAY_MINUTES,
  MAX_TICK_SECONDS,
  OFFERING_ID,
  STRIPE_PRICE_ID,
} from "./config.js";
import { checkoutInput, httpsUrl } from "./checkout.js";
import { COPY } from "./copy.js";
import {
  deviceIdFromCookie,
  dropDeviceUnlock,
  purchaseGrantsUnlock,
  unlockKey,
} from "./entitlement.js";
import { normalizeEmail } from "./email.js";
import { advance, capSeconds, dayStamp, mergePeak, overLimit, playKey } from "./minutes.js";
import { readEmailSession } from "../account/session.js";
import { parentIdFor } from "../account/parent-id.js";
import { readUnlocked, setUnlock } from "../account/store.js";
import { refFromRequest } from "../referral/ref.js";
import { claimAlert, reconcilePaid, recordStep } from "../funnel/funnel.js";

const MAX_BODY = 2000;

const ROUTES = {
  "/api/unlock/status": "GET",
  "/api/unlock/tick": "POST",
  "/api/unlock/checkout": "POST",
  "/api/unlock/confirm": "POST",
  "/api/unlock/referral": "POST",
};

function json(data, status, cookie) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function deviceCookie(id) {
  return `kide_device=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;
}

function newDeviceId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: "big" };
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad" };
    return body;
  } catch {
    return { error: "bad" };
  }
}

async function kvGet(kv, key) {
  if (!kv || typeof kv.get !== "function") return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function kvPut(kv, key, value) {
  if (!kv || typeof kv.put !== "function") return;
  await kv.put(key, JSON.stringify(value));
}

async function kvDel(kv, key) {
  if (!kv || typeof kv.delete !== "function") return;
  await kv.delete(key);
}

function grantConfig() {
  return { offeringId: OFFERING_ID, priceId: STRIPE_PRICE_ID, domain: DOMAIN };
}

// A QA flag must not open Stripe. Metrics have no qa column, so a later
// request without the flag is a real checkout and is counted.
function qaCheckout(url, body) {
  const flag = body && body.qa;
  if (flag === true || flag === 1 || flag === "1" || flag === "true") return true;
  return url.searchParams.get("kide_qa") === "1";
}

async function storedUnlock(env, email) {
  if (!env || !env.DB || !email) return false;
  try {
    const parentId = await parentIdFor("email", email);
    return await readUnlocked(env.DB, parentId);
  } catch {
    return false;
  }
}

async function keptForSession(env, kv, email) {
  if (await storedUnlock(env, email)) return true;
  const cached = await kvGet(kv, unlockKey(email));
  return !!(cached && cached.unlocked === true && typeof cached.sourceRef === "string" && cached.sourceRef);
}

async function recordFamilyUnlock(env, email, sourceRef, active) {
  if (!env || !email) return;
  try {
    const parentId = await parentIdFor("email", email);
    await setUnlock(env, parentId, active ? sourceRef : sourceRef || "", active ? "active" : "inactive");
  } catch {
    // A hub outage can still honor the row already stored.
  }
}

async function rememberUnlock(env, kv, deviceId, email, sourceRef, now) {
  await dropDeviceUnlock(kv, deviceId);
  await kvPut(kv, unlockKey(email), { unlocked: true, sourceRef, at: now });
  await recordFamilyUnlock(env, email, sourceRef, true);
}

async function forgetUnlock(env, kv, deviceId, email) {
  await kvDel(kv, unlockKey(email));
  await dropDeviceUnlock(kv, deviceId);
  await recordFamilyUnlock(env, email, "", false);
}

async function readUnlock(env, kv, deviceId, email, billing, request, now) {
  await dropDeviceUnlock(kv, deviceId);
  if (!email) return { unlocked: false, email: null, sourceRef: "" };
  const keep = async () => ({
    unlocked: await keptForSession(env, kv, email),
    email,
    sourceRef: "",
  });
  if (!billing || typeof billing.getCredits !== "function") return keep();
  try {
    const credits = await billing.getCredits(email);
    const verdict = purchaseGrantsUnlock(credits, grantConfig());
    if (!verdict.known) return keep();
    await reconcilePaid(env, credits, refFromRequest(request), now);
    if (verdict.unlocked) {
      await rememberUnlock(env, kv, deviceId, email, verdict.sourceRef, now);
      return { unlocked: true, email, sourceRef: verdict.sourceRef };
    }
    await forgetUnlock(env, kv, deviceId, email);
    return { unlocked: false, email, sourceRef: "" };
  } catch {
    return keep();
  }
}

function view(state) {
  return {
    ok: true,
    unlocked: state.unlocked === true,
    gated: state.unlocked === true ? false : overLimit(state.seconds || 0, FREE_PLAY_MINUTES),
    countdownSeconds: COUNTDOWN_SECONDS,
    playedSeconds: state.seconds || 0,
  };
}

async function loadSeconds(kv, day, deviceId, email) {
  const device = await kvGet(kv, playKey(day, `device:${deviceId}`));
  const account = email ? await kvGet(kv, playKey(day, `account:${email}`)) : null;
  const seconds = Math.max(
    device && Number(device.seconds) > 0 ? Number(device.seconds) : 0,
    account && Number(account.seconds) > 0 ? Number(account.seconds) : 0,
  );
  return { device, account, seconds };
}

async function savePlay(kv, day, deviceId, email, merged) {
  const limit = FREE_PLAY_MINUTES;
  const device = { ...merged.device, seconds: capSeconds(merged.device.seconds, limit) };
  await kvPut(kv, playKey(day, `device:${deviceId}`), device);
  if (email && merged.account) {
    const account = { ...merged.account, seconds: capSeconds(merged.account.seconds, limit) };
    await kvPut(kv, playKey(day, `account:${email}`), account);
  }
  return device.seconds;
}

async function notifyCheckout(env, ref, now) {
  const rowId = await recordStep(env, { step: "checkout_open", ref, now });
  if (rowId) await claimAlert(env, { step: "checkout_open", ref, now });
}

export async function handleUnlock(request, env, opts = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!(path in ROUTES)) return json({ ok: false, message: COPY.notHere }, 404);
  if (request.method !== ROUTES[path]) {
    return json({ ok: false, message: COPY.method }, 405);
  }

  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const kv = env && env.KIDE_LEADS;
  const existing = deviceIdFromCookie(request);
  const deviceId = existing || newDeviceId();
  const cookie = existing ? null : deviceCookie(deviceId);
  const who = await readEmailSession(request, env);
  const email = who.state === "email" ? who.email : null;
  const billing = env && env.PORTFOLIO_BILLING_SERVICE;

  if (path === "/api/unlock/checkout") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needSignIn }, 400, cookie);
    if (qaCheckout(url, body)) return json({ ok: false, message: COPY.needSignIn }, 400, cookie);
    if (who.state === "outage") return json({ ok: false, message: COPY.retry }, 503, cookie);
    if (!email) return json({ ok: false, message: COPY.needSignIn }, 401, cookie);
    if (!billing || typeof billing.createCheckout !== "function") {
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
    const ref = refFromRequest(request);
    const input = checkoutInput({ origin: url.origin, email, ref });
    try {
      const out = await billing.createCheckout(input);
      const payUrl = httpsUrl(out && out.url);
      if (payUrl) {
        await notifyCheckout(env, ref, now);
        return json({ ok: true, url: payUrl }, 200, cookie);
      }
      await recordStep(env, { step: "checkout_fail", ref, now });
      return json({ ok: false, message: COPY.retry }, 502, cookie);
    } catch {
      await recordStep(env, { step: "checkout_fail", ref, now });
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
  }

  if (path === "/api/unlock/confirm") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needSignIn }, 400, cookie);
    if (who.state === "outage") {
      return json({ ok: false, unlocked: false, pending: true, message: COPY.retry }, 503, cookie);
    }
    if (!email) {
      return json({ ok: false, unlocked: false, pending: true, message: COPY.needSignIn }, 401, cookie);
    }
    const pending = async () => {
      const unlocked = await keptForSession(env, kv, email);
      return json({ ok: true, unlocked, pending: !unlocked }, 200, cookie);
    };
    if (!billing || typeof billing.getCredits !== "function") return pending();
    try {
      const credits = await billing.getCredits(email);
      const verdict = purchaseGrantsUnlock(credits, grantConfig());
      if (!verdict.known) return pending();
      await reconcilePaid(env, credits, refFromRequest(request), now);
      if (verdict.unlocked) {
        await rememberUnlock(env, kv, deviceId, email, verdict.sourceRef, now);
        return json({ ok: true, unlocked: true, pending: false }, 200, cookie);
      }
      await forgetUnlock(env, kv, deviceId, email);
      return json({ ok: true, unlocked: false, pending: true }, 200, cookie);
    } catch {
      return pending();
    }
  }

  const unlock = await readUnlock(env, kv, deviceId, email, billing, request, now);

  if (path === "/api/unlock/referral") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needSignIn }, 400, cookie);
    if (who.state === "outage") return json({ ok: false, message: COPY.retry }, 503, cookie);
    const posted = normalizeEmail(body.email);
    if (posted && posted !== email) return json({ ok: false, message: COPY.referralLocked }, 403, cookie);
    if (!email || !unlock.unlocked || unlock.email !== email) {
      return json({ ok: false, message: COPY.referralLocked }, 403, cookie);
    }
    if (!billing || typeof billing.issueCashReferralCode !== "function") {
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
    try {
      // issueCashReferralCode is a PortfolioBillingService method. It checks the
      // email string only. The session check above is the leaf's. This does not
      // call recordCashReferralFromCheckout or syncCashReferralPayouts.
      const issued = await billing.issueCashReferralCode({ domain: DOMAIN, email });
      if (!issued || issued.ok !== true || typeof issued.link !== "string") {
        return json({ ok: false, message: COPY.retry }, 502, cookie);
      }
      let stats = null;
      if (typeof billing.getCashReferralStatus === "function") {
        // Stored totals only. This does not read Stripe and does not void a row.
        try { stats = await billing.getCashReferralStatus({ domain: DOMAIN, email }); } catch { stats = null; }
      }
      return json({
        ok: true,
        link: httpsUrl(issued.link),
        reward: typeof issued.rewardLabel === "string" ? issued.rewardLabel : "",
        families: stats && stats.ok ? Number(stats.families || 0) : 0,
        earnedCents: stats && stats.ok ? Number(stats.earnedCents || 0) : 0,
      }, 200, cookie);
    } catch {
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
  }

  const day = dayStamp(now);

  if (path === "/api/unlock/status") {
    const loaded = await loadSeconds(kv, day, deviceId, unlock.email || email);
    return json(view({ unlocked: unlock.unlocked, seconds: loaded.seconds }), 200, cookie);
  }

  const body = await readJson(request);
  if (body.error) return json({ ok: false, message: COPY.method }, 400, cookie);
  if (unlock.unlocked) {
    return json(view({ unlocked: true, seconds: 0 }), 200, cookie);
  }
  const player = unlock.email || email;
  const loaded = await loadSeconds(kv, day, deviceId, player);
  const share = refFromRequest(request);
  if (!loaded.device) {
    await recordStep(env, { step: "play_day", ref: share, now, slot: `play_day:${day}:${share || ""}` });
  }
  const deviceNext = advance(loaded.device, now, MAX_TICK_SECONDS);
  const accountNext = player ? advance(loaded.account, now, MAX_TICK_SECONDS) : null;
  const merged = mergePeak(deviceNext, accountNext);
  const seconds = kv ? await savePlay(kv, day, deviceId, player, merged) : merged.device.seconds;
  if (!overLimit(loaded.seconds, FREE_PLAY_MINUTES) && overLimit(seconds, FREE_PLAY_MINUTES)) {
    await recordStep(env, { step: "gate_day", ref: share, now, slot: `gate_day:${day}:${share || ""}` });
  }
  return json(view({ unlocked: false, seconds }), 200, cookie);
}
