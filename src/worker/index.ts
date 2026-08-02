// Sitemap and robots are GENERATED from the pages that actually exist -- the
// hand-written version silently went stale and was missing five live pages.
import { SITEMAP, ROBOTS, PUBLIC_ROUTES } from "./seo-generated";

// kide.us is a leaf on the Quizbiz portfolio billing hub (riskfreetrial) and
// growth control plane (newgrowthbusiness) -- see wrangler.json "services".
// Always call PORTFOLIO_BILLING_SERVICE through this RPC binding. Never
// fetch() the hub's public URL directly from a Worker: riskfreetrial.org's
// bot-fight mode answers a server-to-server POST with Cloudflare error 1010,
// which a service binding call never touches.
const DOMAIN = "kide.us";

// The offerings registered for kide.us in riskfreetrial's
// DOMAIN_CATALOG_OVERRIDES. Kept as a closed set here so a caller cannot ask
// this Worker to open checkout for an arbitrary portfolio offering, and so
// test-billing.mjs can assert both repos still agree on the ids -- a mismatch
// would only ever surface as a 502 at the moment a clinician tried to pay.
const OFFERINGS = new Set(["clinician_report"]);
const DEFAULT_OFFERING = "clinician_report";

type PortfolioAiServiceBinding = {
  createChatCompletion: (input: Record<string, unknown>) => Promise<{
    ok?: boolean;
    status?: number;
    data?: { choices?: { message?: { content?: string } }[] };
    error?: string;
  }>;
};

type PortfolioBillingServiceBinding = {
  getCatalog: (domain: string) => Promise<unknown>;
  createCheckout: (input: Record<string, unknown>) => Promise<{
    ok?: boolean;
    id?: string;
    url?: string;
    error?: string;
  }>;
  getCredits: (email: string) => Promise<{
    ok: true;
    exists: boolean;
    email: string;
    creditsBalance: number;
    summaries?: { domain: string; creditsPurchased: number | null }[];
  }>;
};

export interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
  KIDE_LEADS: KVNamespace;
  MODELS?: R2Bucket;
  PORTFOLIO_AI_SERVICE?: PortfolioAiServiceBinding;
  PORTFOLIO_BILLING_SERVICE?: PortfolioBillingServiceBinding;
  PORTFOLIO_GROWTH_SERVICE?: unknown;
}



const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Kide</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#56C6E6,#BDEBFF);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif;text-align:center;color:#fff;}h1{font-size:22px;}a{color:#fff;font-weight:800;}</style></head><body><div><div style="font-size:64px">🌱</div><h1>Pip couldn't find that page</h1><p><a href="/">Back to Kide</a></p></div></body></html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Pulse 2026-07-29: CTA dual-cover — live /go·/launch·/start·/app HARD404 (branded
    // worker 404) while product home 200 "Kide — The Screen Time…". True 301 to /.
    {
      const raw = url.pathname.replace(/\/$/, "") || "/";
      const cta: Record<string, string> = {
        "/go": "/",
        "/launch": "/",
        "/start": "/",
        "/app": "/",
        "/try": "/",
        "/get-started": "/",
        "/getstarted": "/",
      };
      if (Object.prototype.hasOwnProperty.call(cta, raw) && (request.method === "GET" || request.method === "HEAD")) {
        const dest = new URL(request.url);
        dest.pathname = cta[raw];
        dest.search = "";
        return Response.redirect(dest.toString(), 301);
      }
    }

    // ads.txt is deliberately ABSENT, and this is not an oversight.
    //
    // kide.us is a service directed to children aged roughly 2-7. Under COPPA's
    // amended Rule, persistent identifiers used to serve targeted advertising on
    // a child-directed service are personal information and require verifiable
    // parental consent. An ads.txt file declares ad inventory for this domain and
    // is a public invitation to buy it.
    //
    // It also contradicts the only thing this product actually sells. Every page
    // tells a parent their child's voice never leaves the device; carrying an ad
    // network that fingerprints the same child would make that a technicality.
    // The portfolio already has a convention for this (sensitive domains carry no
    // ad pixels) and kide belongs in it.
    //
    // 404 rather than an empty file: an empty ads.txt is ambiguous, a missing one
    // is not.

    if (url.pathname === "/sitemap.xml") {
      return new Response(SITEMAP, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
    }

    if (url.pathname === "/robots.txt") {
      return new Response(ROBOTS, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // A gift link a parent made and texted to somebody. Rendered here rather
    // than as a static page because the whole point is the preview card that
    // appears in the message, and a crawler building that card does not run
    // JavaScript -- names injected client-side would show up as an empty
    // template in iMessage.
    if (url.pathname === "/gift" || url.pathname === "/gift/") {
      return renderGift(url);
    }

    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          domain: "kide.us",
          worker: "kide",
          ts: new Date().toISOString(),
          bindings: {
            assets: !!env.ASSETS,
            kideLeads: !!env.KIDE_LEADS,
            db: !!env.DB,
            models: !!env.MODELS,
            portfolioBilling: !!env.PORTFOLIO_BILLING_SERVICE,
            portfolioAi: !!env.PORTFOLIO_AI_SERVICE,
            portfolioGrowth: !!env.PORTFOLIO_GROWTH_SERVICE,
          },
        }),
        { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    if (url.pathname === "/api/notify" && request.method === "POST") {
      return handleNotify(request, env);
    }

    // The only paid surface on kide.us: the chart-ready practice record at
    // /clinician, sold to clinicians (docs/WEDGE.md). Everything a child or
    // parent touches is free and always will be.
    if (url.pathname.startsWith("/api/clinician/")) {
      return handleClinicianApi(request, env, url);
    }

    // Model weights for the on-device pronunciation-scoring benchmark
    // (public/bench/). These are too large for git/Workers Assets (the
    // int8 phoneme-CTC model is ~122MB), so they live in R2 and are proxied
    // same-origin here — same-origin also sidesteps CORS entirely, which
    // matters because ONNX Runtime Web fetches this as a plain module asset.
    // Content is immutable per filename (bump the filename to ship a new
    // model version, same convention as /voice/v1/ below).
    if (url.pathname.startsWith("/models/") && (request.method === "GET" || request.method === "HEAD")) {
      return handleModelAsset(request, env, url.pathname.slice("/models/".length));
    }

    try {
      // Two things about this binding that are easy to get wrong, both learned
      // the hard way on this site:
      //   1. Assets are served BEFORE this Worker runs, so setting response
      //      headers on them here is dead code — caching for /voice/* lives in
      //      public/_headers.
      //   2. This is a static multi-page site, so not_found_handling is "none".
      //      With "single-page-application" the Assets layer answered every
      //      missing FILE with 200 + the HTML shell: a missing favicon or
      //      og:image rendered nothing while every check stayed green, and a
      //      missing voice clip arrived as 200 text/html. Misses now reach
      //      the 404 below, honestly.
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    } catch {
      // static asset lookup failed — fall through to the 404 below
    }

    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
};

// Streams a model file out of the MODELS R2 bucket, with Range support (R2
// serves the range directly, so a stalled fetch on a slow iPad connection can
// resume) and a year-long immutable cache — safe because each build ships
// under a versioned filename (gruut-ctc-v1-int8.onnx) rather than overwriting
// one in place.
async function handleModelAsset(request: Request, env: Env, key: string): Promise<Response> {
  if (!env.MODELS) return new Response("models bucket not bound", { status: 500 });
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  // Only ask R2 for a range when the request actually sent a Range header —
  // passing `request.headers` unconditionally made R2 return 206 (with a
  // 0..size-1 "partial" range covering the whole file) even for a plain GET,
  // which is harmless for fetch()-based consumers like ONNX Runtime Web but
  // wrong per HTTP and risks the edge treating it as non-cacheable. Verified
  // live on kide.us post-deploy (2026-07-31) and fixed here.
  const hasRangeHeader = request.headers.has("range");
  const object = await env.MODELS.get(key, {
    range: hasRangeHeader ? request.headers : undefined,
    onlyIf: request.headers,
  });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");

  const hasRange = "range" in object && object.range;
  let status = 200;
  if (hasRange && "offset" in object.range! && object.range!.offset !== undefined) {
    const start = object.range!.offset ?? 0;
    const length = object.range!.length ?? object.size - start;
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    status = 206;
  }

  if (request.method === "HEAD") {
    headers.set("content-length", String(object.size));
    return new Response(null, { status, headers });
  }
  return new Response(object.body, { status, headers });
}

// Minimal KV-backed waitlist. No accounts, no third-party processor — just an
// email address a parent chose to give us, stored once per address.
async function handleNotify(request: Request, env: Env): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return json({ ok: false, error: "invalid_email" }, 400);
  }

  const record = {
    email,
    name: String(body?.name || "").slice(0, 200),
    need: String(body?.need || "").slice(0, 300),
    matchedDomain: String(body?.matchedDomain || "kide").slice(0, 100),
    matchedTitle: String(body?.matchedTitle || "").slice(0, 200),
    pageUrl: String(body?.pageUrl || "").slice(0, 500),
    ts: Date.now(),
  };

  await env.KIDE_LEADS.put(`lead:${email}`, JSON.stringify(record));

  return json({ ok: true });
}

// ── The clinician billing surface ────────────────────────────────────────────
//
// Two endpoints, and one rule that governs both: THE CHILD'S RECORD NEVER
// CROSSES THIS BOUNDARY. Not to this Worker, not to the billing hub, not to
// Stripe. The only thing that leaves the clinician's browser is their own email
// address and an offering id.
//
// That constraint is why the licence is checked here but the professional
// document is rendered in the page. Server-rendering it would be marginally
// harder to bypass and would require posting a child's phoneme history to a
// server, which is the one promise this product cannot break (docs/WEDGE.md,
// docs/VOICE.md, and the amended COPPA Rule's treatment of biometric and
// behavioural records). So this is a professional licence enforced by an
// entitlement check, not DRM, and it is knowingly the weaker of the two. A
// licensed clinician putting a document in a patient chart is not the person
// who defeats it, and designing for that person would cost the privacy
// guarantee that is the entire reason this record can exist.
//
// WHY A LICENCE AND NOT METERED CREDITS. The first version of this sold packs
// of report credits and spent one per unlock. Adversarial review killed it, for
// two independently fatal reasons:
//
//   1. Portfolio credits are ONE fungible balance per person, not a per-domain
//      one (riskfreetrial's fetchLedgerBalance keys on global_user_id alone).
//      trycrm.co sells 100 of the same credits for $9. So a clinician could buy
//      100 reports for $9 instead of 5 for $39, and -- far worse -- an unlocked
//      POST here could drain credits somebody bought on a completely different
//      domain.
//   2. There is no session on this domain by design (no accounts, that is the
//      product). An endpoint that spends money on the strength of an emailed-in
//      string is a remote unauthenticated financial-loss bug, and CSRF-able
//      besides, since request.json() ignores Content-Type.
//
// Entitlement is now derived from PURCHASE HISTORY, which is read-only: has
// this address ever bought the kide.us clinician licence? Nothing this Worker
// does can decrease anybody's balance, so there is no longer anything to steal.
// The remaining exposure is an oracle -- you can ask whether an address holds a
// licence -- which is a boolean about a professional's own purchase, not about
// any child.
//
// Every hub call goes through the PORTFOLIO_BILLING_SERVICE RPC binding. Do not
// replace either with fetch() to riskfreetrial.org: a Worker-to-Worker HTTP
// POST at the public hub URL is what trips Cloudflare error 1010.
async function handleClinicianApi(request: Request, env: Env, url: URL): Promise<Response> {
  const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    });

  const route = url.pathname.slice("/api/clinician/".length);
  const ROUTES: Record<string, string> = { licence: "GET", checkout: "POST" };

  // Dispatch before checking the binding, so a genuinely wrong path says so
  // instead of blaming billing configuration.
  if (!(route in ROUTES)) return json({ ok: false, error: "not_found" }, 404);
  if (request.method !== ROUTES[route]) {
    return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: ROUTES[route] });
  }

  const billing = env.PORTFOLIO_BILLING_SERVICE;
  if (!billing) {
    return json({ ok: false, error: "Billing is not configured for this deploy." }, 503);
  }

  // Read-only. "Has this address bought the kide.us clinician licence?"
  if (route === "licence") {
    const email = normalizeEmail(url.searchParams.get("email"));
    if (!email) return json({ ok: false, error: "invalid_email" }, 400);
    try {
      const out = await billing.getCredits(email);
      // A hub that answered but has never seen this address is a real "no".
      // A hub that did not answer is NOT a "no" -- reporting it as one would
      // push a clinician who already paid into paying again.
      if (!out?.ok) {
        return json({ ok: false, error: "Billing service unavailable — try again shortly" }, 503);
      }
      const licensed = (out.summaries || []).some(
        (s) => s?.domain === DOMAIN && Number(s.creditsPurchased || 0) > 0,
      );
      return json({ ok: true, email, licensed });
    } catch (e) {
      console.warn("clinician licence rpc failed", e);
      return json({ ok: false, error: "Billing service unavailable — try again shortly" }, 503);
    }
  }

  // route === "checkout"
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_request" }, 400);

  const email = normalizeEmail(body.email);
  if (!email) return json({ ok: false, error: "Valid email required to start checkout." }, 400);

  // Closed set, and an unknown id is refused rather than quietly swapped for
  // the default: silently substituting a differently-priced product on a
  // payment path is not a thing this should ever do.
  const requested = typeof body.offeringId === "string" ? body.offeringId.trim() : "";
  const offeringId = requested || DEFAULT_OFFERING;
  if (!OFFERINGS.has(offeringId)) {
    return json({ ok: false, error: "unknown_offering" }, 400);
  }

  const origin = new URL(request.url).origin;
  try {
    const out = await billing.createCheckout({
      domain: DOMAIN,
      offeringId,
      email,
      fullName: typeof body.fullName === "string" ? body.fullName.slice(0, 200) : undefined,
      successUrl: `${origin}/clinician/?checkout=success&email=${encodeURIComponent(email)}`,
      cancelUrl: `${origin}/clinician/?checkout=cancel`,
      sourceDomain: DOMAIN,
    });
    if (out?.url) return json({ ok: true, id: out.id, url: out.url });
    return json({ ok: false, error: out?.error || "Checkout failed" }, 502);
  } catch (e) {
    console.warn("clinician checkout rpc failed", e);
    return json({ ok: false, error: "Billing service unavailable — try again shortly" }, 503);
  }
}

// ── The gift link ────────────────────────────────────────────────────────────
//
// A parent fills in a short form on /parent and gets a URL to text somebody:
// "a gift for Elie, from Kaleigh". This renders that page, and — the reason it
// is server-side at all — the Open Graph card that appears in the message.
//
// THIS IS THE ONLY SURFACE ON KIDE.US WHERE ONE PERSON'S INPUT IS RENDERED TO
// ANOTHER PERSON'S SCREEN. Everywhere else the audience for a value is the
// device that produced it. So the rules here are stricter than anywhere else
// in this Worker:
//
//   - Names are stripped to letters, spaces, apostrophes and hyphens, and
//     capped. Not escaped-and-hoped: an allow-list of characters, so there is
//     nothing left to escape by the time it reaches the template. The note
//     field, which cannot be reduced to letters, is HTML-escaped on top.
//   - The destination is checked against PUBLIC_ROUTES, which is generated
//     from the pages that actually exist. An allow-list that maintains itself
//     cannot go stale, and there is no path by which this becomes an open
//     redirect.
//   - NOTHING IS STORED. No KV write, no D1 row, no log line. A child's first
//     name arrives in a query string because a parent chose to put it there,
//     and it leaves again with the response. There is no reason for us to keep
//     it and every reason not to.
//   - noindex. A personal link is not a page for a search engine.
// 24 was enough for one name. A card is very often from two people -- "Kaleigh
// and Nir", "Grandma & Grandpa" -- and truncating the second sender is a
// nastier failure than it looks, because the person cut off is the one reading
// it. 44 fits two full names and a joiner.
const GIFT_NAME_MAX = 44;
const GIFT_CAST_MAX = 3;
const GIFT_NOTE_MAX = 140;

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Letters (any alphabet), spaces, apostrophes, hyphens. Nothing else survives. */
function giftName(raw: string | null): string {
  if (!raw) return "";
  // & is allowed because people type it. It was being stripped silently, so
  // "Kaleigh & Nir" arrived as "Kaleigh  Nir" -- the joiner deleted and the two
  // names run together. Everything here is HTML-escaped at render, so widening
  // the allow-list by one character costs nothing.
  return raw.normalize("NFC").replace(/[^\p{L}\p{M} '’&-]/gu, "").replace(/\s+/g, " ")
            .trim().slice(0, GIFT_NAME_MAX);
}

function giftNote(raw: string | null): string {
  if (!raw) return "";
  return raw.normalize("NFC").replace(/[^\p{L}\p{M}\p{N} .,!?'’—-]/gu, "")
            .replace(/\s+/g, " ").trim().slice(0, GIFT_NOTE_MAX);
}

/** Destination, validated against the routes the site actually publishes. */
function giftDestination(raw: string | null): { path: string; label: string } {
  const fallback = { path: "/play", label: "Pip's game" };
  if (!raw) return fallback;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (!PUBLIC_ROUTES.includes(path)) return fallback;
  if (path === "/play") return fallback;
  if (path === "/words") return { path, label: "Say it with me" };
  if (path === "/sounds") return { path, label: "Speech sounds by age" };
  if (path.startsWith("/sounds/")) {
    return { path, label: `The “${path.slice("/sounds/".length)}” sound` };
  }
  if (path.startsWith("/guides/")) return { path, label: "a guide for grown-ups" };
  return { path, label: "Kide" };
}

function renderGift(url: URL): Response {
  const to = giftName(url.searchParams.get("to"));
  const from = giftName(url.searchParams.get("from"));
  const note = giftNote(url.searchParams.get("note"));
  // Who appears on the card. Explicit rather than inferred from `to`/`from`,
  // because the interesting cast is usually not the same as the signatories --
  // "from Kaleigh and Nir" is two adults, but the card a child wants shows
  // Kaleigh and the dog. Names only; cast.js resolves them to characters.
  const cast = (url.searchParams.get("cast") || "")
    .split(",").map((n) => giftName(n)).filter(Boolean).slice(0, GIFT_CAST_MAX);
  const dest = giftDestination(url.searchParams.get("t"));

  const headline = to ? `A little gift for ${to}` : "A little gift";
  const sub = from ? `from ${from}` : "";
  const cardTitle = sub ? `${headline}, ${sub}` : headline;
  const description = note
    || `${to || "Someone little"} can play this on any phone or tablet. It's free, there are no `
     + "accounts and no ads, and nothing a child says ever leaves the device.";

  // Same portfolio OG renderer every other page on this domain uses, so the
  // message preview looks like Kide rather than like a bare link.
  //
  // The description is sent explicitly and that matters more here than
  // anywhere. Without it the renderer falls back to the brand tagline for the
  // domain, and kide.us is not in that registry, so the card under "A little
  // gift for Elie" read "Part of the Growth.Business portfolio" — which is the
  // opposite of a gift from one parent to another.
  const og = "https://www.growth.business/api/og?domain=kide.us"
    + `&title=${encodeURIComponent(cardTitle)}`
    + `&description=${encodeURIComponent(description)}`
    + `&template=page&path=${encodeURIComponent("/gift")}`;

  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(cardTitle)} · Kide</title>
<meta name="description" content="${escHtml(description)}">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#56C6E6">
<link rel="icon" href="/favicon.ico" sizes="any">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kide">
<meta property="og:title" content="${escHtml(cardTitle)}">
<meta property="og:description" content="${escHtml(description)}">
<meta property="og:url" content="${escHtml(url.origin)}/gift">
<meta property="og:image" content="${escHtml(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(cardTitle)}">
<meta name="twitter:description" content="${escHtml(description)}">
<meta name="twitter:image" content="${escHtml(og)}">
<link rel="stylesheet" href="/guides/shared.css">
<link rel="stylesheet" href="/mobile.css">
<style>
  body{background:linear-gradient(180deg,#56C6E6,#BDEBFF);min-height:100vh}
  .gift{max-width:560px;margin:0 auto;padding:38px 22px 60px;text-align:center;color:#fff}
  /* Pip, drawn exactly as the homepage and the game draw him rather than
     substituted with the 🌱 emoji that used to sit here. This card is the first
     thing a family ever sees of Kide, and it was introducing the product with a
     character the product does not contain — the emoji is a seedling, Pip is a
     face. No image request either, so it renders instantly inside a message
     preview and cannot 404. */
  .gift .pip{width:132px;height:132px;margin:0 auto;position:relative;
             filter:drop-shadow(0 10px 12px rgba(0,0,0,.16))}
  .gift .pip-body{position:absolute;left:8%;right:8%;bottom:4%;top:14%;
    background:linear-gradient(160deg,#6FD08C,#4FB874);
    border-radius:48% 48% 46% 46% / 58% 58% 42% 42%;
    box-shadow:inset 0 -10px 18px rgba(0,0,0,.10),inset 0 8px 14px rgba(255,255,255,.35)}
  .gift .pip-cheek{position:absolute;width:13%;height:8%;background:#FF8FA8;opacity:.55;
    border-radius:50%;top:56%}
  .gift .pip-cheek.l{left:14%}.gift .pip-cheek.r{right:14%}
  .gift .pip-eye{position:absolute;width:19%;height:22%;background:#fff;border-radius:50%;top:32%;
    box-shadow:0 2px 3px rgba(0,0,0,.08)}
  .gift .pip-eye.l{left:22%}.gift .pip-eye.r{right:22%}
  .gift .pip-pupil{position:absolute;width:52%;height:52%;background:#2E3A3F;border-radius:50%;
    top:26%;left:26%}
  .gift .pip-mouth{position:absolute;left:32%;right:32%;top:60%;height:16%}
  .gift .pip-sprout{position:absolute;top:-6%;left:50%;transform:translateX(-50%);width:34%;height:26%}
  .gift .pip-stem{position:absolute;bottom:0;left:50%;width:6%;height:70%;background:#3D9C63;
    transform:translateX(-50%);border-radius:3px}
  .gift .pip-leaf{position:absolute;width:46%;height:32%;
    background:linear-gradient(160deg,#8CE3A9,#4FB874);border-radius:0% 100% 0% 100%;bottom:32%}
  .gift .pip-leaf.n1{left:2%;transform:rotate(-18deg)}
  .gift .pip-leaf.n2{right:2%;transform:rotate(18deg) scaleX(-1);bottom:46%}
  .gift .hello{font-size:17px;font-weight:800;color:#fff;margin:14px 0 0;opacity:.95}
  /* The stage. min-height reserves the space before the cast resolves, so the
     text underneath does not jump when the characters arrive -- the card is
     very often opened on a slow phone over cellular. */
  .gift .stage{display:flex;align-items:flex-end;justify-content:center;gap:6px;
               min-height:190px;margin-bottom:2px}
  .gift .stage .pip{margin:0}
  .gift .actor{width:132px;max-width:31vw;flex:0 0 auto;cursor:pointer;
               background:none;border:0;padding:0;-webkit-tap-highlight-color:transparent;
               animation:breathe 3.4s ease-in-out infinite;transform-origin:bottom center}
  .gift .actor:nth-child(2){animation-delay:-1.1s}
  .gift .actor:nth-child(3){animation-delay:-2.2s}
  .gift .actor svg{width:100%;height:auto;display:block;overflow:visible}
  .gift .actor .blinker{animation:blink 5.5s ease-in-out infinite;transform-origin:center}
  .gift .actor:nth-child(2) .blinker{animation-delay:-2.3s}
  .gift .actor:nth-child(3) .blinker{animation-delay:-3.9s}
  @keyframes breathe{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-5px) rotate(-1.2deg)}}
  @keyframes blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}97%{transform:scaleY(1)}}
  /* The tap reaction. One short, obvious, non-scoring wiggle -- the card is not
     a game and must not start competing with the button underneath it. */
  @keyframes wiggle{
    0%{transform:translateY(0) rotate(0) scale(1)}
    25%{transform:translateY(-16px) rotate(-7deg) scale(1.05)}
    50%{transform:translateY(0) rotate(5deg) scale(.98)}
    75%{transform:translateY(-7px) rotate(-3deg) scale(1.02)}
    100%{transform:translateY(0) rotate(0) scale(1)}
  }
  .gift .actor.tapped{animation:wiggle .62s ease-in-out}
  .gift .cast-name{display:block;font-size:13px;font-weight:800;color:#fff;
                   opacity:.9;margin-top:2px;text-shadow:0 1px 2px rgba(0,0,0,.15)}
  /* Anyone who has asked their system not to animate things gets a still card.
     This is a children's product, but the parent holding the phone is the one
     who set that preference. */
  @media (prefers-reduced-motion: reduce){
    .gift .actor,.gift .actor .blinker,.gift .actor.tapped{animation:none}
  }
  .gift h1{font-size:clamp(28px,7vw,42px);margin:10px 0 4px;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.08)}
  .gift .from{font-size:19px;font-weight:800;opacity:.95;margin:0}
  .gift .note{background:rgba(255,255,255,.92);color:#2E3A3F;border-radius:20px;padding:18px 20px;
              margin:22px 0 0;font-size:17px;line-height:1.5;box-shadow:0 4px 0 rgba(0,0,0,.08)}
  .gift .what{background:#FFFBF2;color:#2E3A3F;border-radius:20px;padding:20px;margin-top:16px;text-align:left}
  .gift .what b{display:block;margin-bottom:6px}
  .gift .what ul{margin:8px 0 0;padding-left:18px;font-size:15px;color:#5B6A67}
  .gift .what li{margin:4px 0}
  .gift .go{display:inline-block;margin-top:26px;border-radius:999px;padding:18px 36px;font-size:19px;
            font-weight:800;color:#fff;text-decoration:none;
            background:linear-gradient(180deg,#FF8A73,#F16E55);box-shadow:0 5px 0 rgba(0,0,0,.14)}
  .gift .fine{font-size:13.5px;opacity:.92;margin-top:22px}
  .gift .fine a{color:#fff}
</style>
</head>
<body>
<div class="gift">
  <!-- THE CAST, ON TOP; THE WORDS, UNDERNEATH.
       The card used to open with a headline addressed to an adult, and the
       picture was a decoration beside it. That is the right order for a page
       somebody reads and the wrong one for a page a small child is looking at
       over their parent's shoulder. The characters now hold the top of the
       screen and the text sits below them, where it is still perfectly
       readable by the person who came for the words.

       Server-rendered as an empty stage and filled by /scene/cast.js on the
       client. The card that appears in an iMessage preview is built by a
       crawler that runs no JavaScript, which is why the HEADLINE and the note
       are still server-rendered above -- the words survive with or without
       scripting, and so does the fallback Pip below. -->
  <div class="stage" id="stage" data-cast="${escHtml(cast.join(","))}">
    <div class="pip" id="stageFallback" aria-hidden="true">
      <div class="pip-sprout"><div class="pip-stem"></div><div class="pip-leaf n1"></div><div class="pip-leaf n2"></div></div>
      <div class="pip-body">
        <div class="pip-cheek l"></div><div class="pip-cheek r"></div>
        <div class="pip-eye l"><div class="pip-pupil"></div></div>
        <div class="pip-eye r"><div class="pip-pupil"></div></div>
        <div class="pip-mouth"><svg viewBox="0 0 40 20" width="100%" height="100%"><path d="M4,4 Q20,20 36,4" stroke="#2E3A3F" stroke-width="4" fill="none" stroke-linecap="round"/></svg></div>
      </div>
    </div>
  </div>
  <p class="hello" id="hello">${to ? `&ldquo;Hello, ${escHtml(to)}!&rdquo;` : "&ldquo;Hello!&rdquo;"}</p>
  <h1>${escHtml(headline)}</h1>
  ${sub ? `<p class="from">${escHtml(sub)}</p>` : ""}
  ${note ? `<p class="note">${escHtml(note)}</p>` : ""}

  <div class="what">
    <b>What this is</b>
    <p style="margin:0;font-size:15.5px;color:#5B6A67">Kide is a gentle learning game for little
      children. Pip the Sprout reads every question out loud, so a child who can't read yet can
      play on their own — and Pip gets sleepy at the end and asks to be tucked in, so screen time
      finishes without a fight.</p>
    <ul>
      <li>Free, with no accounts and no ads</li>
      <li>Nothing your child says ever leaves the device</li>
      <li>Nothing is scored, and there is no way to lose</li>
    </ul>
  </div>

  <a class="go" href="${escHtml(dest.path)}">Open ${escHtml(dest.label)}</a>
  <p class="fine">Made by <a href="/">kide.us</a> · <a href="/privacy">privacy</a></p>
</div>
<script type="module">
/* NOTE ON INDENTATION: the closing braces below are indented on purpose.
   test-gift.mjs finds the end of renderGift() by matching up to the first
   newline-then-brace at column 0, and a top-level `}` inside this template
   literal truncates that match early -- which silently dropped the X-Robots-Tag
   assertion rather than failing loudly. Keeping braces off column 0 keeps the
   test measuring the whole function.

   Fills the stage with the cast. Everything here is local: cast.js resolves a
   name to one of the product's own rigs and recolours it, and no request of any
   kind is made. If this module fails to load, the server-rendered Pip above
   stays exactly where it is and the card still reads correctly -- which is why
   the fallback is real markup rather than a spinner. */
import { castFrom } from '/scene/cast.js';

const stage = document.getElementById('stage');
const names = (stage?.dataset.cast || '').split(',').map((n) => n.trim()).filter(Boolean);
if (stage && names.length) {
  let cast = [];
  try { cast = castFrom(names); } catch { cast = []; }
  if (cast.length) {
    stage.innerHTML = cast.map((c) => {
      /* The rigs carry ids (a-eyeL, a-root...) that are unique within one
         character and duplicated the moment two are on the page. Scoped away
         here rather than in actors.js, because inside the game exactly one
         actor is ever mounted and the ids are correct as they stand. */
      const svg = c.svg.replace(/id="a-/g, 'data-a="');
      return '<button class="actor" type="button" aria-label="' + c.name + ', ' + c.species + '">'
        /* Measured from the rigs themselves rather than guessed: the widest
           (the dog, ears out) spans x 40-170 and both span y 25-186, so this
           frames every rig with a little air and no cropped ear. */
        + '<svg viewBox="36 20 138 170" role="img" aria-hidden="true">' + svg + '</svg>'
        + '<span class="cast-name">' + c.name + '</span></button>';
    }).join('');
    /* Blinking is applied after mounting so it targets whatever the rig calls
       its eyes, without cast.js needing to know the anatomy of four rigs. */
    stage.querySelectorAll('[data-a="eyeL"],[data-a="eyeR"]')
         .forEach((el) => el.classList.add('blinker'));
    stage.querySelectorAll('.actor').forEach((el) => {
      el.addEventListener('click', () => {
        el.classList.remove('tapped');
        void el.offsetWidth;          // restart the animation on a repeat tap
        el.classList.add('tapped');
      });
      el.addEventListener('animationend', (e) => {
        if (e.animationName === 'wiggle') el.classList.remove('tapped');
      });
    });
  }
  }
</script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Personal, and cheap to rebuild. Cached only by the sharing app that is
      // fetching the preview, never by a shared cache.
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function normalizeEmail(input: unknown): string | null {
  const email = String(input || "").trim().toLowerCase();
  if (!email || email.length > 200) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function readJson(request: Request): Promise<Record<string, any> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, any>) : null;
  } catch {
    return null;
  }
}
