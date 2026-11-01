// Money path: visit → tool use → signup → credits / paid step → Stripe.
// Routes that belong to the parent account and are not the existing email
// and passkey proxy. Returns null when src/worker/account.js should answer,
// so that proxy stays the account system.

import { loginChannel } from "./channel.js";
import { handleParentSession } from "./session.js";
import { handleSmsAuth } from "./sms.js";

export async function routeParentAccount(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/account/session") return handleParentSession(request, env);
  if (loginChannel(env) === "sms" && (path === "/api/account/code" || path === "/api/account/verify")) {
    return handleSmsAuth(request, env);
  }
  return null;
}
