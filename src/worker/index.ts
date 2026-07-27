export interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
  KIDE_LEADS: KVNamespace;
}

const SITEMAP = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://kide.us/</loc></url><url><loc>https://kide.us/play</loc></url><url><loc>https://kide.us/privacy</loc></url><url><loc>https://kide.us/terms</loc></url></urlset>`;

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Kide</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#56C6E6,#BDEBFF);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,sans-serif;text-align:center;color:#fff;}h1{font-size:22px;}a{color:#fff;font-weight:800;}</style></head><body><div><div style="font-size:64px">🌱</div><h1>Pip couldn't find that page</h1><p><a href="/">Back to Kide</a></p></div></body></html>`;

// Route paths in this app are all extensionless (/play, /privacy, …), so a
// trailing ".<ext>" means the request is for a file that should exist.
const FILE_EXT = /\.[a-z0-9]{2,5}$/i;
function looksLikeFile(pathname: string): boolean {
  return FILE_EXT.test(pathname);
}
function isHtml(res: Response): boolean {
  return (res.headers.get("Content-Type") || "").includes("text/html");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    try {
      // Note: static assets are served by the Assets binding BEFORE this Worker
      // runs, so setting response headers on them here would be dead code —
      // caching for /voice/* lives in public/_headers instead.
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        // `not_found_handling: single-page-application` answers a MISSING file
        // with 200 + the HTML shell. For a page route that is the point; for a
        // file it is a silent lie — a missing favicon or og:image looks fine to
        // every check, and a missing voice clip arrives as text/html with a 200
        // so the audio element fails in a way nothing reports. Real paths have
        // no extension, so anything asking for one gets an honest 404.
        if (looksLikeFile(url.pathname) && isHtml(asset)) {
          return new Response(NOT_FOUND_HTML, {
            status: 404,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return asset;
      }
    } catch {
      // static asset lookup failed — fall through to the 404 below
    }

    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
};

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
