// Money path: /r/<code> keeps the share cookie for checkout custom_ref;
// /parent/earnings shows the family's own link. Cash balances stay closed
// until the shared program matches the approved $6 / $50 / Connect terms.
// D1 is not a second cash authority. Client email is not an identity.

import { currentParent, verifiedParentEmail } from "../account/session.js";
import {
  CASH_CLOSED,
  SHARE_REWARD,
  closedCash,
  issueShareCode,
  lookupPublicCode,
  notifyReferralActivity,
  shareStatus,
} from "./apply.js";
import { normalizeRef, refCookie } from "./ref.js";

export const EARNINGS_COPY = {
  signedOut: "Sign in to see what your link has earned.",
  locked: "Your link opens once family play is on.",
  needAccount: "Sign in with your parent account to open your link.",
  reward: SHARE_REWARD,
  closed: CASH_CLOSED,
  retry: "Pip could not open that just now. Try again in a moment.",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function notFound() {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Kide</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#56C6E6,#BDEBFF);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif;text-align:center;color:#fff;}h1{font-size:22px;}a{color:#fff;font-weight:800;}</style></head><body><div><div style="font-size:64px">🌱</div><h1>Pip couldn't find that page</h1><p><a href="/">Back to Kide</a></p></div></body></html>`;
  return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function redirectHome(request, code) {
  const dest = new URL(request.url);
  dest.pathname = "/";
  dest.search = `?ref=${code}`;
  const headers = new Headers();
  headers.set("Location", dest.toString());
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.append("Set-Cookie", refCookie(code));
  return new Response(null, { status: 302, headers });
}

export async function handleRefLanding(request, env, raw) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, message: "Open the link in the browser." }, 405);
  }
  const code = normalizeRef(raw);
  if (!code) return notFound();
  const hub = env && env.PORTFOLIO_BILLING_SERVICE;
  if (hub && typeof hub.getCashReferrerPublic === "function") {
    const pub = await lookupPublicCode(env, code);
    if (pub.ok !== true) return json({ ok: false, message: EARNINGS_COPY.retry }, 503);
    if (pub.found !== true) return notFound();
    await notifyReferralActivity(env, { code, step: "link_open" });
    return redirectHome(request, code);
  }
  // Hub unbound: cookie only so checkout can send customMetadata.ref.
  // That is not a cash credit and not a completed payout journey.
  return redirectHome(request, code);
}

function zeros(message) {
  return {
    ok: true,
    ...closedCash({ message }),
  };
}

export async function handleEarnings(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, message: EARNINGS_COPY.retry }, 405);
  }
  const who = await currentParent(request, env);
  const email = await verifiedParentEmail(request, env);
  if (!who.parentId) {
    return json({ signedIn: false, unlocked: false, ...zeros(EARNINGS_COPY.signedOut) });
  }
  if (!email) {
    // 10409 owns auth: phone-only or unverified sessions cannot mint cash identity.
    return json({
      signedIn: true,
      unlocked: who.unlocked === true,
      ...zeros(EARNINGS_COPY.needAccount),
    });
  }
  if (!who.unlocked) {
    return json({
      signedIn: true,
      unlocked: false,
      ...zeros(EARNINGS_COPY.locked),
    });
  }
  const issued = await issueShareCode(env, { email });
  const summary = await shareStatus(env, { email });
  const link = (summary && summary.link) || (issued && issued.link) || null;
  const code = (summary && summary.code) || (issued && issued.code) || null;
  if (!issued && !summary) {
    return json({
      ok: false,
      signedIn: true,
      unlocked: true,
      ...closedCash({ message: EARNINGS_COPY.retry }),
    }, 503);
  }
  return json({
    ok: true,
    signedIn: true,
    unlocked: true,
    closed: true,
    pendingCents: 0,
    availableCents: 0,
    paidCents: 0,
    families: 0,
    openSendCents: 0,
    link,
    code,
    reward: link ? SHARE_REWARD : "",
    message: CASH_CLOSED,
  });
}

export async function handleReferralHttp(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/parent/earnings" || path === "/api/parent/earnings/") {
    return handleEarnings(request, env);
  }
  if (path === "/r" || path === "/r/") return notFound();
  const match = path.match(/^\/r\/([^/]+)\/?$/);
  if (!match) return null;
  let raw = match[1];
  try { raw = decodeURIComponent(raw); } catch { return notFound(); }
  return handleRefLanding(request, env, raw);
}
