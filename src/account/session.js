// Money path: visit → tool use → signup → credits / paid step → Stripe.
// Session API for the unlock and the leaderboard.
// currentParent(request, env) → { parentId, unlocked }
// parentId is null when currentSession does not return an email.
// unlocked is true only after setUnlock recorded an active family unlock.
// The cookie is read by PortfolioMessagingService. This file does not mint one.
//
// Hub currentSession (passkey.ts, pin a686eaa) reads domain and session.
// session is the raw Cookie header or a 43-character token. Success is
// { ok: true, email }. That is an email session: the hub checks the session
// hash, domain, and expiry. It does not prove a parent role, family
// membership, or a payment. Issuance lifetime is 15 minutes. Rows are deleted
// on expired read, logout, and reissue. This leaf does not purge login_session.
// { ok: false, error: "storage_error" } and a thrown call are an outage.
// { ok: false } is logged out (invalid, expired, wrong domain, and revoked
// all look like that on the wire). A mock of those results is not live auth.

import { DOMAIN, normalizeEmail } from "./channel.js";
import { parentIdFor } from "./parent-id.js";
import { ensureParent, readUnlocked, setUnlock } from "./store.js";

export { setUnlock };

const SIGNED_OUT = { parentId: null, unlocked: false };

function sessionPresented(header) {
  if (!header) return false;
  if (/(?:^|;)\s*__Host-rft_session=/.test(header)) return true;
  return /^[A-Za-z0-9_-]{43}$/.test(header);
}

// Caller-side helper. verifiedParentEmail is not a field on the hub result.
export async function readEmailSession(request, env) {
  const header = request && request.headers ? request.headers.get("cookie") || "" : "";
  const presented = sessionPresented(header);
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!presented) return { state: "anonymous" };
  if (!messaging || typeof messaging.currentSession !== "function") return { state: "outage" };
  let result;
  try {
    result = await messaging.currentSession({ domain: DOMAIN, session: header });
  } catch {
    return { state: "outage" };
  }
  if (result && result.ok === true) {
    const email = normalizeEmail(result.email);
    return email ? { state: "email", email } : { state: "anonymous" };
  }
  if (result && result.error === "storage_error") return { state: "outage" };
  return { state: "anonymous" };
}

export async function currentParent(request, env) {
  const who = await readEmailSession(request, env);
  // Outage and logged-out both hide the parent id. Neither deletes an unlock row.
  if (who.state !== "email") return { ...SIGNED_OUT };
  const email = who.email;
  const computed = await parentIdFor("email", email);
  let parentId = computed;
  if (env && env.DB) {
    try {
      parentId = await ensureParent(env.DB, { id: computed, email, phone: null });
    } catch {
      parentId = computed;
    }
  }
  let unlocked = false;
  if (env && env.DB) {
    try {
      unlocked = await readUnlocked(env.DB, parentId);
    } catch {
      unlocked = false;
    }
  }
  return { parentId, unlocked: unlocked === true };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// GET /api/account/session. Two fields. No email, no cookie, no hub codes.
export async function handleParentSession(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({
      parentId: null,
      unlocked: false,
      message: "Open the account page to sign in.",
    }, 405);
  }
  return json(await currentParent(request, env));
}
