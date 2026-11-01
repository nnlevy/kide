// Money path: visit → tool use → signup → credits / paid step → Stripe.
// Session API for the unlock and the leaderboard.
// currentParent(request, env) → { parentId, unlocked }
// parentId is null when the messaging service does not name this browser.
// unlocked is true only after setUnlock recorded an active family unlock.
// The cookie is read by PortfolioMessagingService. This file does not mint one.

import { DOMAIN, normalizeEmail, toE164 } from "./channel.js";
import { parentIdFor } from "./parent-id.js";
import { ensureParent, readUnlocked, setUnlock } from "./store.js";

export { setUnlock };

const SIGNED_OUT = { parentId: null, unlocked: false };

function messagingOf(env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.currentSession !== "function") return null;
  return messaging;
}

export async function currentParent(request, env) {
  const messaging = messagingOf(env);
  if (!messaging) return { ...SIGNED_OUT };
  let result;
  try {
    result = await messaging.currentSession({
      domain: DOMAIN,
      session: request.headers.get("cookie") || "",
    });
  } catch {
    return { ...SIGNED_OUT };
  }
  if (!result || result.ok !== true) return { ...SIGNED_OUT };
  const email = normalizeEmail(result.email);
  const phone = toE164(typeof result.phone === "string" ? result.phone : "");
  if (!email && !phone) return { ...SIGNED_OUT };

  const computed = email ? await parentIdFor("email", email) : await parentIdFor("phone", phone);
  let parentId = computed;
  if (env && env.DB) {
    try {
      parentId = await ensureParent(env.DB, { id: computed, email, phone });
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
