export interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
  KIDE_LEADS: KVNamespace;
  MODELS?: R2Bucket;
}

const SITEMAP = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://kide.us/</loc></url><url><loc>https://kide.us/play</loc></url><url><loc>https://kide.us/privacy</loc></url><url><loc>https://kide.us/terms</loc></url></urlset>`;

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

    if (url.pathname === "/ads.txt") {
      return new Response("google.com, pub-1860356577073395, DIRECT, f08c47fec0942fa0\n", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (url.pathname === "/sitemap.xml") {
      return new Response(SITEMAP, { headers: { "Content-Type": "application/xml" } });
    }

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\nSitemap: https://kide.us/sitemap.xml");
    }

    if (url.pathname === "/api/notify" && request.method === "POST") {
      return handleNotify(request, env);
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

  const object = await env.MODELS.get(key, {
    range: request.headers,
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

  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
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
