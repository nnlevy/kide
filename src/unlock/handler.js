// Money path: visit → tool use (Pip play) → signup → paid step → Stripe.
//
// Family play reuses PORTFOLIO_BILLING_SERVICE createCheckout and getCredits.
// It does not talk to Stripe, does not hold a secret key, and does not read a
// child's practice record. The price id is the live family price in config.js.
//
// Unpaid play stores a day total in KV, per device and per signed-in parent.
// A stored unlock (or a purchase history hit) skips that total.

import {
  COUNTDOWN_SECONDS,
  DOMAIN,
  FREE_PLAY_MINUTES,
  MAX_TICK_SECONDS,
  OFFERING_ID,
  STRIPE_PRICE_ID,
} from "./config.js";
import { checkoutInput, httpsUrl } from "./checkout.js";
import { alertOwner, recordStep } from "../funnel/funnel.js";
import { COPY } from "./copy.js";
import { confirmedPurchaseKeys, deviceUnlockKey, purchaseGrantsUnlock, unlockKey } from "./entitlement.js";
import { normalizeEmail } from "./email.js";
import { advance, capSeconds, dayStamp, mergePeak, overLimit, playKey } from "./minutes.js";
import { parentIdFor } from "../account/parent-id.js";
import { setUnlock } from "../account/session.js";
import { refFromRequest } from "../referral/ref.js";

const DEVICE_RE = /^[A-Za-z0-9_-]{22,80}$/;
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

function deviceFrom(request) {
  const raw = request.headers.get("cookie") || "";
  const match = raw.match(/(?:^|;\s*)kide_device=([A-Za-z0-9_-]{22,80})/);
  return match && DEVICE_RE.test(match[1]) ? match[1] : null;
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

async function sessionEmail(request, env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.currentSession !== "function") return null;
  const session = request.headers.get("cookie") || "";
  if (!session.includes("__Host-rft_session=")) return null;
  try {
    const result = await messaging.currentSession({ domain: DOMAIN, session });
    if (!result || result.ok !== true) return null;
    return normalizeEmail(result.email);
  } catch {
    return null;
  }
}

function grantConfig() {
  return { offeringId: OFFERING_ID, priceId: STRIPE_PRICE_ID, domain: DOMAIN };
}

const FRESH_MS = 60000;

async function recordFamilyUnlock(env, email, active) {
  if (!env || !email) return;
  try {
    const parentId = await parentIdFor("email", email);
    await setUnlock(env, parentId, OFFERING_ID, active ? "active" : "inactive");
  } catch {
    // The minute gate still has the KV copy if the parent table cannot be written.
  }
}

async function readUnlock(env, kv, deviceId, email, billing, now) {
  let deviceEmail = null;
  if (deviceId) {
    const onDevice = await kvGet(kv, deviceUnlockKey(deviceId));
    if (onDevice && onDevice.unlocked === true && typeof onDevice.email === "string") {
      deviceEmail = onDevice.email;
    }
  }
  const who = email || deviceEmail;
  if (!who) return { unlocked: false, email: null };

  const cached = await kvGet(kv, unlockKey(who));
  const fresh = cached && cached.unlocked === true && typeof cached.at === "number" && (now - cached.at) < FRESH_MS;
  if (fresh) return { unlocked: true, email: who };

  if (!billing || typeof billing.getCredits !== "function") {
    return { unlocked: !!(cached && cached.unlocked) || !!deviceEmail, email: who };
  }
  try {
    const credits = await billing.getCredits(who);
    const verdict = purchaseGrantsUnlock(credits, grantConfig());
    if (!verdict.known) {
      return { unlocked: !!(cached && cached.unlocked) || !!deviceEmail, email: who };
    }
    if (verdict.unlocked) {
      await rememberUnlock(env, kv, deviceId, who, now);
      return { unlocked: true, email: who };
    }
    await forgetUnlock(env, kv, deviceId, who);
    return { unlocked: false, email: who };
  } catch {
    return { unlocked: !!(cached && cached.unlocked) || !!deviceEmail, email: who };
  }
}

async function rememberUnlock(env, kv, deviceId, email, now) {
  const at = now;
  await kvPut(kv, unlockKey(email), { unlocked: true, at });
  if (deviceId) await kvPut(kv, deviceUnlockKey(deviceId), { unlocked: true, email, at });
  await recordFamilyUnlock(env, email, true);
}

async function forgetUnlock(env, kv, deviceId, email) {
  await kvDel(kv, unlockKey(email));
  if (deviceId) {
    const onDevice = await kvGet(kv, deviceUnlockKey(deviceId));
    if (onDevice && onDevice.email === email) await kvDel(kv, deviceUnlockKey(deviceId));
  }
  await recordFamilyUnlock(env, email, false);
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

// One "paid" row per confirmed purchase, though the success page asks several
// times. The marker is written only after that row is stored. recordStep
// returns 0 and does not throw when the database is missing or the insert
// fails; a marker written first would never expire, and the purchase would
// stay uncounted. An unfinished checkout has no key and is not counted. The
// funnel row itself carries no email. qa is never set here: the kide_qa
// cookie is unsigned, so it must not drop a purchase out of the paid total
// or burn this marker on a row that does not count.
async function countPaidOnce(env, kv, request, email, now, credits) {
  try {
    for (const purchaseKey of confirmedPurchaseKeys(credits, grantConfig())) {
      const bytes = new TextEncoder().encode(`kide-funnel-paid:${email}\n${purchaseKey}`);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const key = `kide:funnel-paid:v2:${hex}`;
      if (kv && (await kvGet(kv, key))) continue;
      const rowId = await recordStep(env, { step: "paid", ref: refFromRequest(request), qa: false, now });
      if (!rowId) continue;
      if (kv) await kv.put(key, JSON.stringify({ at: now }));
    }
  } catch {
    // Counting never blocks the unlock.
  }
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
  const existing = deviceFrom(request);
  const deviceId = existing || newDeviceId();
  const cookie = existing ? null : deviceCookie(deviceId);
  const email = await sessionEmail(request, env);
  const billing = env && env.PORTFOLIO_BILLING_SERVICE;

  if (path === "/api/unlock/checkout") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needEmail }, 400, cookie);
    const payEmail = normalizeEmail(body.email);
    if (!payEmail) return json({ ok: false, message: COPY.needEmail }, 400, cookie);
    if (!billing || typeof billing.createCheckout !== "function") {
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
    const ref = refFromRequest(request);
    const input = checkoutInput({ origin: url.origin, email: payEmail, ref });
    try {
      const out = await billing.createCheckout(input);
      const payUrl = httpsUrl(out && out.url);
      if (payUrl) {
        const rowId = await recordStep(env, { step: "checkout_open", ref, qa: false, now });
        if (ref && rowId && opts.alert !== false) {
          const work = alertOwner(env, { rowId, step: "checkout_open", ref, now });
          if (opts.ctx && typeof opts.ctx.waitUntil === "function") opts.ctx.waitUntil(work);
          else await work;
        }
        return json({ ok: true, url: payUrl }, 200, cookie);
      }
      await recordStep(env, { step: "checkout_fail", ref, qa: false, now });
      return json({ ok: false, message: COPY.retry }, 502, cookie);
    } catch {
      await recordStep(env, { step: "checkout_fail", ref, qa: false, now });
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
  }

  if (path === "/api/unlock/confirm") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needEmail }, 400, cookie);
    const payEmail = normalizeEmail(body.email);
    if (!payEmail) return json({ ok: false, message: COPY.needEmail }, 400, cookie);
    if (!billing || typeof billing.getCredits !== "function") {
      const cached = await kvGet(kv, unlockKey(payEmail));
      return json({
        ok: true,
        unlocked: !!(cached && cached.unlocked),
        pending: !(cached && cached.unlocked),
      }, 200, cookie);
    }
    try {
      const credits = await billing.getCredits(payEmail);
      const verdict = purchaseGrantsUnlock(credits, grantConfig());
      if (!verdict.known) {
        const cached = await kvGet(kv, unlockKey(payEmail));
        const unlocked = !!(cached && cached.unlocked);
        return json({ ok: true, unlocked, pending: !unlocked }, 200, cookie);
      }
      if (verdict.unlocked) {
        await countPaidOnce(env, kv, request, payEmail, now, credits);
        await rememberUnlock(env, kv, deviceId, payEmail, now);
        return json({ ok: true, unlocked: true, pending: false }, 200, cookie);
      }
      await forgetUnlock(env, kv, deviceId, payEmail);
      return json({ ok: true, unlocked: false, pending: true }, 200, cookie);
    } catch {
      const cached = await kvGet(kv, unlockKey(payEmail));
      const unlocked = !!(cached && cached.unlocked);
      return json({ ok: true, unlocked, pending: !unlocked }, 200, cookie);
    }
  }

  const unlock = await readUnlock(env, kv, deviceId, email, billing, now);

  // A family's own share link. Only for an email that has family play on this
  // device (a paid receipt) or is the signed-in parent, so a stranger cannot
  // mint a payout code for someone else's address from this page.
  if (path === "/api/unlock/referral") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, message: COPY.needEmail }, 400, cookie);
    const want = normalizeEmail(body.email) || unlock.email || email;
    const allowed = want && ((unlock.unlocked && unlock.email === want) || email === want);
    if (!allowed) return json({ ok: false, message: COPY.referralLocked }, 403, cookie);
    if (!billing || typeof billing.issueCashReferralCode !== "function") {
      return json({ ok: false, message: COPY.retry }, 503, cookie);
    }
    try {
      const issued = await billing.issueCashReferralCode({ domain: DOMAIN, email: want });
      if (!issued || issued.ok !== true || typeof issued.link !== "string") {
        return json({ ok: false, message: COPY.retry }, 502, cookie);
      }
      let stats = null;
      if (typeof billing.getCashReferralStatus === "function") {
        try { stats = await billing.getCashReferralStatus({ domain: DOMAIN, email: want }); } catch { stats = null; }
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

  // tick
  const body = await readJson(request);
  if (body.error) return json({ ok: false, message: COPY.method }, 400, cookie);
  if (unlock.unlocked) {
    return json(view({ unlocked: true, seconds: 0 }), 200, cookie);
  }
  const who = unlock.email || email;
  const loaded = await loadSeconds(kv, day, deviceId, who);
  // Funnel: a device's first free-play tick today, and the tick that uses the
  // day up. Counts only, from the meter that already runs. See src/funnel.
  // Same rule as paid and checkout: the unsigned kide_qa cookie does not
  // keep a play day or a used-up day out of the count.
  if (!loaded.device) await recordStep(env, { step: "play_day", ref: refFromRequest(request), qa: false, now });
  const deviceNext = advance(loaded.device, now, MAX_TICK_SECONDS);
  const accountNext = who ? advance(loaded.account, now, MAX_TICK_SECONDS) : null;
  const merged = mergePeak(deviceNext, accountNext);
  const seconds = kv ? await savePlay(kv, day, deviceId, who, merged) : merged.device.seconds;
  if (!overLimit(loaded.seconds, FREE_PLAY_MINUTES) && overLimit(seconds, FREE_PLAY_MINUTES)) {
    await recordStep(env, { step: "gate_day", ref: refFromRequest(request), qa: false, now });
  }
  return json(view({ unlocked: false, seconds }), 200, cookie);
}
