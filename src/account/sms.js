// Money path: visit → tool use → signup → credits / paid step → Stripe.
// SMS sign-in, used only when KIDE_LOGIN_CHANNEL is "sms".
// Calls PortfolioMessagingService sendOtp / verifyOtp / recordConsent.
// Does not send a text itself and does not read a provider key.
// Until that channel is on, email codes keep going through src/worker/account.js.

import { visitorSentence } from "../worker/account.js";
import { DOMAIN, consentText, SMS_CONSENT_VERSION, normalizeEmail, toE164 } from "./channel.js";

const MAX_BODY = 20000;
const SESSION_MAX_AGE_SEC = 900;
const UNAVAILABLE = "Sign-in isn't available right now. Try again in a moment.";
const GENERIC = "Something went wrong. Try again in a moment.";
const BAD_PHONE = "Enter a valid US mobile number.";
const NEED_CONSENT = "Check the box if you want a text with your code.";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function secretsOf(result) {
  const secrets = [];
  if (!result || typeof result !== "object") return secrets;
  if (typeof result.sessionToken === "string" && result.sessionToken.length >= 20) secrets.push(result.sessionToken);
  if (typeof result.cookie === "string" && result.cookie) {
    secrets.push(result.cookie);
    const token = result.cookie.match(/__Host-rft_session=([A-Za-z0-9_-]{43})/);
    if (token) secrets.push(token[1]);
  }
  return secrets;
}

function scrubText(value, result, phone) {
  let msg = typeof value === "string" ? value : "";
  for (const secret of secretsOf(result)) msg = msg.split(secret).join("");
  if (phone) msg = msg.split(phone).join("");
  return msg.replace(/__Host-rft_session=[A-Za-z0-9_-]*/g, "");
}

function sessionCookie(result) {
  if (!result || typeof result !== "object") return null;
  const fromHub = typeof result.cookie === "string" ? result.cookie : "";
  const match = fromHub.match(/^__Host-rft_session=([A-Za-z0-9_-]{43}); HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=(\d{1,8})$/);
  if (match) {
    const age = Number(match[2]);
    if (age >= 60 && age <= 86400) return fromHub;
  }
  const token = typeof result.sessionToken === "string" ? result.sessionToken : "";
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return `__Host-rft_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`;
  }
  return null;
}

function withCookie(response, cookie) {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

function respond(view, status, result, cookie) {
  const secrets = secretsOf(result);
  const body = JSON.stringify(view);
  if (secrets.some((secret) => secret && body.includes(secret))) {
    return json({ ok: false, signedIn: false, message: GENERIC }, 502);
  }
  return withCookie(json(view, status), cookie);
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: "too_big" };
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad" };
    return body;
  } catch {
    return { error: "bad" };
  }
}

async function callHub(messaging, method, input) {
  if (typeof messaging[method] !== "function") return { ok: false, message: UNAVAILABLE };
  try {
    const result = await messaging[method](input);
    return result && typeof result === "object" ? result : { ok: false, message: GENERIC };
  } catch {
    return { ok: false, message: GENERIC };
  }
}

function parentView(result, phone) {
  const ok = Boolean(result && result.ok === true);
  const leaked = Boolean(phone && result && typeof result.message === "string" && result.message.includes(phone));
  const raw = leaked && ok ? "We sent a code by text." : scrubText(result && result.message, result, phone);
  return {
    ok,
    message: visitorSentence(raw, ok ? "We sent a code by text." : GENERIC),
  };
}

export async function handleSmsAuth(request, env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.sendOtp !== "function" || typeof messaging.verifyOtp !== "function") {
    return json({ ok: false, message: UNAVAILABLE }, 503);
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method !== "POST") {
    return json({ ok: false, message: "Open the account page to sign in." }, 405);
  }
  const body = await readJson(request);
  if (body.error) return json({ ok: false, message: "Something on that form wasn't right. Try again." }, 400);
  const phone = toE164(body.phone);
  if (!phone) return json({ ok: false, message: BAD_PHONE }, 400);
  const ip = (request.headers.get("cf-connecting-ip") || "").slice(0, 64);

  if (path === "/api/account/code") {
    if (body.consent !== true) return json({ ok: false, message: NEED_CONSENT }, 400);
    const consent = await callHub(messaging, "recordConsent", {
      domain: DOMAIN,
      phone,
      text: consentText(),
      version: SMS_CONSENT_VERSION,
      source: "kide-account",
      ip,
    });
    if (consent.ok !== true) {
      return respond(parentView(consent, phone), 400, consent, null);
    }
    const result = await callHub(messaging, "sendOtp", { domain: DOMAIN, phone, ip });
    return respond(parentView(result, phone), result.ok === true ? 200 : 400, result, null);
  }

  if (path === "/api/account/verify") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const result = await callHub(messaging, "verifyOtp", { domain: DOMAIN, phone, code, ip });
    const cookie = result && result.ok === true ? sessionCookie(result) : null;
    const email = normalizeEmail(result && result.email);
    const known = Boolean(email || toE164(result && typeof result.phone === "string" ? result.phone : ""));
    const signedIn = Boolean(cookie && known);
    const view = {
      ok: Boolean(result && result.ok === true),
      signedIn,
      message: visitorSentence(
        scrubText(result && result.message, result, phone),
        signedIn ? "You are signed in." : GENERIC,
      ),
    };
    if (signedIn && email) view.email = email;
    return respond(view, result.ok === true ? 200 : 400, result, cookie);
  }

  return null;
}
