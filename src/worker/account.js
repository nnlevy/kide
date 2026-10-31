// Money path: visit → tool use → signup → credits / paid step → Stripe.
// This module is the signup step. A parent signs in on kide.us. The $39
// clinician licence is a later phase and is not touched here.
//
// Auth is PortfolioMessagingService on the riskfreetrial worker, called through
// the PORTFOLIO_MESSAGING_SERVICE binding. This file does not generate codes,
// store codes, send email, send SMS, or keep a second session table.
//
// Hub methods this calls (entrypoint PortfolioMessagingService):
//   sendLoginCode({ domain, email, ip })
//   verifyCode({ domain, email, code, ip })
//       → { ok, message, email, sessionToken, cookie } on a good email code
//   preparePasskeyRegistration({ domain, email, session, ip })
//   registerPasskey({ domain, email, session, credential, ip })
//   preparePasskeySignIn({ domain, email?, ip })
//   signInPasskey({ domain, credential, ip })
//       → { ok, message, email, sessionToken, cookie } on success
//         (riskfreetrial #173, same shape as verifyCode)
//   currentSession({ domain, session }) → { ok: true, email } | { ok: false }
//   endSession({ domain, session }) → { ok: true } | { ok: false }
//
// The hub already does the rules: 6-digit codes, 10-minute expiry, lock after
// 5 tries, passkeys. SMS starts sending only when that worker's SMS_LIVE_SENDS
// flag is on and a from-number is set. This proxy never passes a phone, so
// kide keeps asking for email until a later phase adds a phone field.
//
// signedIn is true only after this worker attaches a host-only session cookie
// and the hub named the email. A passkey the hub accepts without a session
// is not a sign-in. The session token never appears in JSON.

const DOMAIN = "kide.us";
const MAX_BODY = 20000;
// Matches PortfolioMessagingService SESSION_MAX_AGE_SEC (15 minutes). Used
// only when the hub returns a sessionToken and omits the cookie string.
const SESSION_MAX_AGE_SEC = 900;

const UNAVAILABLE = "Sign-in isn't available right now. Try again in a moment.";
const GENERIC = "Something went wrong. Try again in a moment.";
const BAD_EMAIL = "Enter a valid email address.";
const NEED_SIGNIN = "Sign in with the code we email you.";
const SIGNED_OUT = "You are signed out on this browser.";

const ROUTES = {
  "/api/account/code": "POST",
  "/api/account/verify": "POST",
  "/api/account/me": "GET",
  "/api/account/passkey/register/options": "POST",
  "/api/account/passkey/register": "POST",
  "/api/account/passkey/signin/options": "POST",
  "/api/account/passkey/signin": "POST",
  "/api/account/signout": "POST",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, "");
  if (email.length < 3 || email.length > 254) return null;
  if (email.startsWith(".") || email.includes("..") || email.includes("@.") || email.includes(".@")) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
  return email;
}

// A sentence a parent can read. Error-code tokens, the session token, and hub
// internals never leave this worker, even when the hub put them in `message`.
export function visitorSentence(value, fallback = GENERIC) {
  if (typeof value !== "string") return fallback;
  const msg = value.replace(/\s+/g, " ").trim();
  if (msg.length < 2 || msg.length > 240) return fallback;
  if (/^[a-z0-9_-]+$/i.test(msg)) return fallback;
  if (/SMS_|TWILIO|TELNYX|wrangler|sessionToken|__Host|PortfolioMessaging|provider_|dry_run|error_|attemptsRemaining/i.test(msg)) {
    return fallback;
  }
  return msg;
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

function scrubText(value, result) {
  let msg = typeof value === "string" ? value : "";
  for (const secret of secretsOf(result)) msg = msg.split(secret).join("");
  return msg.replace(/__Host-rft_session=[A-Za-z0-9_-]*/g, "");
}

function clientIp(request) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  return ip.slice(0, 64);
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

function clearCookie() {
  return "__Host-rft_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

function b64url(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

function longB64(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 8192 && /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

// The hub's publicKey is what the browser needs for WebAuthn. Pin the relying
// party to this site, and drop anything else the hub might attach.
export function publicKeyForBrowser(pk) {
  if (!pk || typeof pk !== "object") return null;
  const challenge = b64url(pk.challenge);
  if (!challenge) return null;
  const out = {
    challenge,
    timeout: 60000,
    userVerification: "preferred",
  };
  if (pk.rp && typeof pk.rp === "object") out.rp = { name: "Kide", id: DOMAIN };
  if (typeof pk.rpId === "string") out.rpId = DOMAIN;
  if (pk.user && typeof pk.user === "object") {
    const id = longB64(pk.user.id);
    if (!id) return null;
    const name = typeof pk.user.name === "string" ? pk.user.name.slice(0, 254) : "";
    out.user = { id, name, displayName: name };
  }
  if (Array.isArray(pk.pubKeyCredParams)) {
    const params = pk.pubKeyCredParams
      .filter((p) => p && p.type === "public-key" && (p.alg === -7 || p.alg === -257))
      .map((p) => ({ type: "public-key", alg: p.alg }));
    if (params.length) out.pubKeyCredParams = params;
  }
  if (pk.attestation === "none") out.attestation = "none";
  if (pk.authenticatorSelection && typeof pk.authenticatorSelection === "object") {
    const sel = pk.authenticatorSelection;
    const next = {};
    if (sel.residentKey === "required" || sel.residentKey === "preferred" || sel.residentKey === "discouraged") {
      next.residentKey = sel.residentKey;
    }
    if (typeof sel.requireResidentKey === "boolean") next.requireResidentKey = sel.requireResidentKey;
    if (sel.userVerification === "required" || sel.userVerification === "preferred" || sel.userVerification === "discouraged") {
      next.userVerification = sel.userVerification;
    }
    if (Object.keys(next).length) out.authenticatorSelection = next;
  }
  return out;
}

function credentialForHub(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const response = raw.response && typeof raw.response === "object" ? raw.response : {};
  const packed = {
    id: longB64(raw.id) || undefined,
    rawId: longB64(raw.rawId) || longB64(raw.id) || undefined,
    type: "public-key",
    response: {},
  };
  for (const key of ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"]) {
    const value = longB64(response[key]);
    if (value) packed.response[key] = value;
  }
  if (!packed.response.clientDataJSON) return null;
  return packed;
}

// What the browser is allowed to see. The hub's `error`, `provider`,
// `attemptsRemaining`, `cookie`, and `sessionToken` stay on this side.
export function parentView(result, extras = {}) {
  const ok = Boolean(result && result.ok === true);
  const message = visitorSentence(scrubText(result && result.message, result), ok ? "You are signed in." : GENERIC);
  const view = { ok, message, ...extras };
  const email = result && normalizeEmail(result.email);
  if (ok && email && extras.signedIn === true) view.email = email;
  return view;
}

// Host-only cookie plus the hub's email. Anything else is not a sign-in,
// including a passkey the hub accepted without minting a session.
function signInView(result) {
  const cookie = result && result.ok === true ? sessionCookie(result) : null;
  const email = normalizeEmail(result && result.email);
  const signedIn = Boolean(cookie && email);
  const message = visitorSentence(
    scrubText(result && result.message, result),
    signedIn ? "You are signed in." : GENERIC,
  );
  const view = { ok: Boolean(result && result.ok === true), signedIn, message };
  if (signedIn) view.email = email;
  // Attach the host cookie whenever one was actually minted. signedIn still
  // waits for the hub email, so a cookie alone does not paint "Signed in as".
  return { view, cookie };
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

function messagingOf(env) {
  const messaging = env && env.PORTFOLIO_MESSAGING_SERVICE;
  if (!messaging || typeof messaging.sendLoginCode !== "function" || typeof messaging.verifyCode !== "function") {
    return null;
  }
  return messaging;
}

async function callHub(messaging, method, input) {
  if (typeof messaging[method] !== "function") {
    return { ok: false, message: UNAVAILABLE };
  }
  try {
    const result = await messaging[method](input);
    return result && typeof result === "object" ? result : { ok: false, message: GENERIC };
  } catch {
    return { ok: false, message: GENERIC };
  }
}

function withCookie(response, cookie) {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

// Last gate. If a session token survived into the JSON, do not send that body
// and do not attach a cookie.
function respond(view, status, result, cookie) {
  const secrets = secretsOf(result);
  let body = JSON.stringify(view);
  if (secrets.some((secret) => secret && body.includes(secret))) {
    return json({ ok: false, signedIn: false, message: GENERIC }, 502);
  }
  return withCookie(json(view, status), cookie);
}

export async function handleAccount(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!(path in ROUTES)) {
    return json({ ok: false, message: "Open the account page to sign in." }, 404);
  }
  if (request.method !== ROUTES[path]) {
    return json({ ok: false, message: "Open the account page to sign in." }, 405);
  }

  if (path === "/api/account/signout") {
    const messaging = messagingOf(env);
    const session = request.headers.get("cookie") || "";
    if (!messaging || typeof messaging.endSession !== "function") {
      return withCookie(json({ ok: false, signedIn: false, message: UNAVAILABLE }, 503), clearCookie());
    }
    await callHub(messaging, "endSession", { domain: DOMAIN, session });
    return withCookie(json({ ok: true, signedIn: false, message: SIGNED_OUT }), clearCookie());
  }

  const messaging = messagingOf(env);
  const ip = clientIp(request);
  const session = request.headers.get("cookie") || "";

  if (path === "/api/account/me") {
    // No reader on the binding means we cannot know who the cookie is.
    // Fail closed: not signed in, and no address for the page to display.
    if (!messaging || typeof messaging.currentSession !== "function") {
      return json({ ok: false, signedIn: false, message: NEED_SIGNIN }, 503);
    }
    const result = await callHub(messaging, "currentSession", { domain: DOMAIN, session });
    const email = normalizeEmail(result.email);
    if (result.ok === true && email) {
      return respond({
        ok: true,
        signedIn: true,
        email,
        message: visitorSentence(scrubText(result.message, result), "You are signed in."),
      }, 200, result, null);
    }
    return respond({
      ok: false,
      signedIn: false,
      message: visitorSentence(scrubText(result.message, result), NEED_SIGNIN),
    }, 200, result, null);
  }

  if (!messaging) return json({ ok: false, message: UNAVAILABLE }, 503);

  const body = await readJson(request);
  if (body.error) return json({ ok: false, message: "Something on that form wasn't right. Try again." }, 400);

  // Phone is ignored on purpose. The hub sends SMS only after its own flag
  // and from-number change; kide does not grow a second way to text people.
  const email = body.email == null || body.email === "" ? null : normalizeEmail(body.email);
  if (body.email && !email) return json({ ok: false, message: BAD_EMAIL }, 400);

  if (path === "/api/account/code") {
    if (!email) return json({ ok: false, message: BAD_EMAIL }, 400);
    const result = await callHub(messaging, "sendLoginCode", { domain: DOMAIN, email, ip });
    const status = result.ok === true ? 200 : 400;
    return respond(parentView(result, {}), status, result, null);
  }

  if (path === "/api/account/verify") {
    if (!email) return json({ ok: false, message: BAD_EMAIL }, 400);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const result = await callHub(messaging, "verifyCode", { domain: DOMAIN, email, code, ip });
    const { view, cookie } = signInView(result);
    return respond(view, result.ok === true ? 200 : 400, result, cookie);
  }

  if (path === "/api/account/passkey/register/options" || path === "/api/account/passkey/signin/options") {
    const method = path.endsWith("/register/options") ? "preparePasskeyRegistration" : "preparePasskeySignIn";
    if (method === "preparePasskeyRegistration" && !email) return json({ ok: false, message: BAD_EMAIL }, 400);
    const input = { domain: DOMAIN, ip, session };
    if (email) input.email = email;
    const result = await callHub(messaging, method, input);
    if (result.ok !== true) return json(parentView(result), 400);
    const publicKey = publicKeyForBrowser(result.publicKey);
    if (!publicKey) return json({ ok: false, message: GENERIC }, 502);
    return respond({ ...parentView(result), publicKey }, 200, result, null);
  }

  if (path === "/api/account/passkey/register" || path === "/api/account/passkey/signin") {
    const method = path.endsWith("/register") ? "registerPasskey" : "signInPasskey";
    const credential = credentialForHub(body.credential);
    if (!credential) return json({ ok: false, message: "That passkey could not be verified. Try again, or use your email code." }, 400);
    if (method === "registerPasskey" && !email) return json({ ok: false, message: BAD_EMAIL }, 400);
    const input = { domain: DOMAIN, ip, session, credential };
    if (email) input.email = email;
    const result = await callHub(messaging, method, input);
    if (method === "signInPasskey") {
      const { view, cookie } = signInView(result);
      return respond(view, result.ok === true ? 200 : 400, result, cookie);
    }
    const saved = parentView(result, {});
    return respond(saved, result.ok === true ? 200 : 400, result, null);
  }

  return json({ ok: false, message: "Open the account page to sign in." }, 404);
}
