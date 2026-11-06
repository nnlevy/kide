// The invited-parent homepage and the referrer's own claim bar.
//
// A share link (?ref=CODE) renders the homepage around the person who shared it:
// "Austin thought your kiddo should meet Pip." The name comes from the billing
// hub (first name only, never an email), and goes into the link preview too, so
// the iMessage card already says who sent it. Unknown or unnamed codes say
// "A friend", which is still true: somebody shared the link.
//
// A claim link (?ref=CODE&claim=TOKEN) is the one the owner hands the referrer.
// It adds a "Welcome Austin" bar with what they earn and one button to add the
// email their payouts go to. The hub checks the token and spends it on use.
// Parents following the plain link never see the bar or the payout.
//
// The hub owns names, tokens and payouts (riskfreetrial src/cashReferrals.ts).
// This file renders and forwards. It never decides a payout.

import { SHARE_REWARD } from "./apply.js";
import { normalizeRef, refFromUrl } from "./ref.js";

const DOMAIN = "kide.us";
const CLAIM_RE = /^[a-f0-9]{16,40}$/;
const NAME_RE = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]{0,19}$/;
const HUB_TIMEOUT_MS = 1500;

export function claimFromUrl(url) {
  try {
    const raw = (new URL(url).searchParams.get("claim") || "").trim().toLowerCase();
    return CLAIM_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function withTimeout(promise) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), HUB_TIMEOUT_MS))]);
}

export async function lookupReferrer(env, code, claim) {
  const hub = env && env.PORTFOLIO_BILLING_SERVICE;
  if (!hub || typeof hub.getCashReferrerPublic !== "function") return null;
  try {
    const out = await withTimeout(hub.getCashReferrerPublic({ domain: DOMAIN, code, ...(claim ? { claim } : {}) }));
    if (!out || out.ok !== true) return null;
    const firstName = typeof out.firstName === "string" && NAME_RE.test(out.firstName) ? out.firstName : null;
    return {
      firstName,
      claimable: out.claimable === true,
      rewardLabel: typeof out.rewardLabel === "string" ? out.rewardLabel.slice(0, 140) : null,
    };
  } catch {
    return null;
  }
}

export function inviteCopy(firstName) {
  const who = firstName || "A friend";
  return {
    title: `${who} thought your kiddo should meet Pip`,
    headline: `${who} thought your kiddo should meet Pip.`,
    line: "Colors, counting and first words, read aloud for ages 2 to 7. Then Pip gets sleepy and ends screen time, no fight.",
    cta: "Meet Pip, free",
    preview: "Pip reads every question out loud for ages 2 to 7, then gets sleepy and ends screen time itself. Free to play, no sign-up.",
  };
}

const setAttr = (name, value) => ({ element(el) { el.setAttribute(name, value); } });
const setText = (text) => ({ element(el) { el.setInnerContent(text); } });
const show = { element(el) { el.removeAttribute("hidden"); } };

// Wraps the homepage asset for a share link. Anything else passes through.
export async function inviteResponse(request, env, asset) {
  if (!asset || asset.status !== 200) return asset;
  if (request.method !== "GET" && request.method !== "HEAD") return asset;
  const code = refFromUrl(request.url);
  if (!code) return asset;
  if (!/text\/html/i.test(asset.headers.get("content-type") || "")) return asset;

  const claim = claimFromUrl(request.url);
  const ref = await lookupReferrer(env, code, claim);
  const copy = inviteCopy(ref && ref.firstName);
  const claimable = !!(claim && ref && ref.claimable);

  let rw = new HTMLRewriter()
    .on("title", setText(`${copy.title} · Kide`))
    .on('meta[property="og:title"]', setAttr("content", copy.title))
    .on('meta[name="twitter:title"]', setAttr("content", copy.title))
    .on('meta[property="og:description"]', setAttr("content", copy.preview))
    .on('meta[name="twitter:description"]', setAttr("content", copy.preview))
    .on('meta[name="description"]', setAttr("content", copy.preview))
    .on("#heroTitle", setText(copy.headline))
    .on("#heroLine", setText(copy.line))
    .on("#heroCta", setText(copy.cta))
    .on("#inviteDeal", show);

  if (claimable) {
    rw = rw
      .on("#claimBar", show)
      .on("#claimBar", setAttr("data-code", code))
      .on("#claimBar", setAttr("data-claim", claim))
      .on("#claimName", setText(ref.firstName ? `Welcome ${ref.firstName}` : "Welcome"))
      .on("#claimReward", setText(SHARE_REWARD));
  }

  const out = rw.transform(asset);
  const res = new Response(out.body, out);
  // Personal to the link: never shared from a cache.
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.delete("ETag");
  if (claimable) res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const CLAIM_ERRORS = {
  invalid_email: "That email doesn't look right. Try again?",
  email_in_use: "That email already has a kide link. Ask Nir to sort it out.",
  not_claimable: "This link was already claimed.",
};

// POST /api/ref/claim {code, claim, email}
export async function handleRefClaim(request, env) {
  if (request.method !== "POST") return jsonRes({ ok: false, error: "method_not_allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ ok: false, error: "bad_request" }, 400);
  }
  const code = normalizeRef(body && body.code);
  const claim = typeof (body && body.claim) === "string" && CLAIM_RE.test(body.claim.trim().toLowerCase()) ? body.claim.trim().toLowerCase() : null;
  const email = typeof (body && body.email) === "string" ? body.email.trim().slice(0, 240) : "";
  if (!code || !claim) return jsonRes({ ok: false, error: CLAIM_ERRORS.not_claimable }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return jsonRes({ ok: false, error: CLAIM_ERRORS.invalid_email }, 400);
  const hub = env && env.PORTFOLIO_BILLING_SERVICE;
  if (!hub || typeof hub.claimCashReferrer !== "function") return jsonRes({ ok: false, error: "Saving isn't available right now. Try again soon." }, 503);
  try {
    const out = await hub.claimCashReferrer({ domain: DOMAIN, code, claim, email });
    if (out && out.ok === true) {
      return jsonRes({ ok: true, link: `https://${DOMAIN}/?ref=${code}`, rewardLabel: SHARE_REWARD });
    }
    const reason = out && out.reason;
    return jsonRes({ ok: false, error: CLAIM_ERRORS[reason] || "That didn't save. Try again?" }, 400);
  } catch {
    return jsonRes({ ok: false, error: "Saving isn't available right now. Try again soon." }, 503);
  }
}
