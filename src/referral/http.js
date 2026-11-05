// Money path: /r/<code> keeps the share, /parent/earnings shows the cash.
// Pending, available, and paid are the parent's own figures. The send queue
// stays off this page.

import { currentParent } from "../account/session.js";
import { SHARE_REWARD, issueShareCode, shareStatus } from "./apply.js";
import { codeByValue } from "./ledger.js";
import { normalizeRef, refCookie } from "./ref.js";

export const EARNINGS_COPY = {
  signedOut: "Sign in to see what your link has earned.",
  locked: "Your link opens once family play is on.",
  reward: SHARE_REWARD,
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

export async function handleRefLanding(request, env, raw) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, message: "Open the link in the browser." }, 405);
  }
  const code = normalizeRef(raw);
  if (!code) return notFound();
  if (env && env.DB) {
    try {
      const row = await codeByValue(env.DB, code);
      if (!row) return notFound();
    } catch {
      // A database miss should not eat a link a parent already sent.
    }
  }
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

async function parentContact(db, parentId) {
  if (!db) return { email: null, phone: null };
  try {
    const row = await db.prepare(
      `SELECT email, phone_e164 FROM kide_parents WHERE id = ?`,
    ).bind(parentId).first();
    return {
      email: row && typeof row.email === "string" ? row.email : null,
      phone: row && typeof row.phone_e164 === "string" ? row.phone_e164 : null,
    };
  } catch {
    return { email: null, phone: null };
  }
}

export async function handleEarnings(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, message: EARNINGS_COPY.retry }, 405);
  }
  const who = await currentParent(request, env);
  const zeros = { pendingCents: 0, availableCents: 0, paidCents: 0, link: null, code: null, openSendCents: 0, families: 0 };
  if (!who.parentId) {
    return json({ ok: true, signedIn: false, unlocked: false, ...zeros, message: EARNINGS_COPY.signedOut });
  }
  if (!env || !env.DB) {
    return json({ ok: false, signedIn: true, message: EARNINGS_COPY.retry }, 503);
  }
  const now = Date.now();
  try {
    if (who.unlocked) {
      const contact = await parentContact(env.DB, who.parentId);
      await issueShareCode(env, {
        parentId: who.parentId,
        email: contact.email,
        phone: contact.phone,
        request,
      });
    }
    const summary = await shareStatus(env, who.parentId, now);
    return json({
      ok: true,
      signedIn: true,
      unlocked: who.unlocked === true,
      pendingCents: summary.pendingCents,
      availableCents: summary.availableCents,
      paidCents: summary.paidCents,
      families: summary.families,
      openSendCents: summary.openSendCents,
      link: summary.link,
      code: summary.code,
      reward: summary.link ? EARNINGS_COPY.reward : "",
      message: who.unlocked ? "" : EARNINGS_COPY.locked,
    });
  } catch {
    return json({ ok: false, signedIn: true, message: EARNINGS_COPY.retry }, 503);
  }
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
