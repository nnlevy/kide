#!/usr/bin/env node
/**
 * Page discovery for the platform gate when a site has no explicit page list
 * (PLATFORM_GATE_PATHS / state/platform-gate-keyurls/<domain> always win; platform-gate-check.sh decides that).
 * Sources: /sitemap.xml (nested <sitemapindex> followed, bounded) + every same-origin <a href> on the live home page.
 * Deduped (path only, trailing slash / query / hash dropped), "/" first, capped (default 40) so runs stay bounded.
 * No browser: plain fetches only, so it costs no extra memory next to the gate's single browser.
 *   node tools/platform-gate/discover-pages.mjs <baseUrl> [--domain example.com] [--keyurls FILE] [--cap 40] [--json]
 * Honors PLATFORM_GATE_PATHS, then --keyurls FILE, before discovering.
 * Prints one path per line (or JSON). Exit 0 with pages; exit 4 when neither a sitemap nor any link was found.
 */
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main.mjs";
import { blockRum } from "./rum-block.mjs";

export const DEFAULT_CAP = 40;
const MAX_SITEMAPS = 10;
const bare = (h) => String(h || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
const SKIP_EXT = /\.(xml|txt|json|webmanifest|js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|gz|mp4|webm|mp3|woff2?|ttf|otf|eot)$/i;

export function normPath(p) { const s = String(p || "/").split(/[?#]/)[0] || "/"; return s.length > 1 ? s.replace(/\/+$/, "") || "/" : "/"; }

// <urlset><url><loc> -> pages; <sitemapindex><sitemap><loc> -> nested sitemaps
export function parseSitemap(xml) {
  const s = String(xml || ""); const locs = (frag) => [...frag.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const sitemaps = [...s.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)].flatMap((m) => locs(m[1]));
  const pages = [...s.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].flatMap((m) => locs(m[1]));
  return { pages, sitemaps, isSitemap: /<(urlset|sitemapindex)\b/i.test(s) };
}

export function hrefsFromHtml(html) { return [...String(html || "").matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/&amp;/g, "&")); }

// Same site = the base origin, or the audited domain (apex/www) — sitemap locs name the live domain even on a local build.
export function samePath(href, baseUrl, siteHost) {
  let u; try { u = new URL(href, baseUrl); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const base = new URL(baseUrl);
  if (u.origin !== base.origin && bare(u.hostname) !== bare(siteHost || base.hostname)) return null;
  const p = normPath(u.pathname); if (SKIP_EXT.test(p) || /^\/cdn-cgi\//.test(p)) return null;
  return p;
}

export function dedupeCap(paths, cap = DEFAULT_CAP) {
  const all = [...new Set(["/", ...paths.filter(Boolean)])];
  return { paths: all.slice(0, cap), total: all.length, capped: all.length > cap };
}

// fetchText(url) -> { ok, status, text } ; never throws upward.
export async function discoverPages({ baseUrl, siteHost, fetchText, renderedHrefs = null, cap = DEFAULT_CAP }) {
  const base = new URL(baseUrl); const host = siteHost || base.hostname; const get = async (u) => { try { return await fetchText(u); } catch { return { ok: false, status: 0, text: "" }; } };
  const fromSitemap = []; const seen = new Set(); const queue = [new URL("/sitemap.xml", base).href]; let sitemapFound = false; let fetched = 0;
  while (queue.length && fetched < MAX_SITEMAPS) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url); fetched++;
    const r = await get(url); if (!r.ok) continue;
    const sm = parseSitemap(r.text); if (!sm.isSitemap) continue; sitemapFound = true;
    for (const p of sm.pages) { const x = samePath(p, base.href, host); if (x) fromSitemap.push(x); }
    for (const n of sm.sitemaps) { try { const nu = new URL(n, base); const local = new URL(nu.pathname + nu.search, base).href; if (bare(nu.hostname) === bare(host) || nu.origin === base.origin) queue.push(local); } catch {} }
  }
  const home = await get(base.href);
  let fromHome = home.ok ? hrefsFromHtml(home.text).map((h) => samePath(h, base.href, host)).filter(Boolean) : [];
  let rendered = false; // JS-rendered nav: only when static HTML had no links, one headless page, then closed
  if (!fromHome.length && renderedHrefs) { try { fromHome = (await renderedHrefs(base.href)).map((h) => samePath(h, base.href, host)).filter(Boolean); rendered = true; } catch {} }
  const linksFound = fromHome.some((p) => p !== "/") || fromHome.length > 0;
  const out = dedupeCap([...fromSitemap, ...fromHome], cap);
  const error = !sitemapFound && !linksFound ? `no sitemap at ${new URL("/sitemap.xml", base).href} and no same-origin links on ${base.href}${home.ok ? "" : ` (home HTTP ${home.status})`}` : null;
  return { ...out, cap, sitemapFound, sitemapUrls: fetched, sitemapPages: new Set(fromSitemap).size, homeLinks: new Set(fromHome).size, rendered, error };
}

// Precedence: PLATFORM_GATE_PATHS > keyurls file > discovery. Explicit lists are used verbatim (no cap, no discovery).
export async function resolvePaths({ envPaths, keyurls, discover }) {
  const split = (t) => String(t || "").split(/\s+/).filter(Boolean);
  if (split(envPaths).length) return { source: "PLATFORM_GATE_PATHS", paths: split(envPaths), error: null };
  if (split(keyurls).length) return { source: "keyurls", paths: split(keyurls), error: null };
  const r = await discover(); return { source: "discovery", ...r };
}

export async function chromiumHrefs(url) {
  const { chromium } = await import("playwright"); const b = await chromium.launch();
  try { const bc = await b.newContext(); await blockRum(bc, "discover"); const pg = await bc.newPage(); await pg.goto(url, { waitUntil: "load", timeout: 45000 }); await pg.waitForTimeout(1500);
    return await pg.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href)); } finally { await b.close(); }
}

export const httpFetchText = async (u) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
  try { const r = await fetch(u, { redirect: "follow", signal: ac.signal, headers: { "user-agent": "platform-gate-discover/1" } }); const text = r.ok ? (await r.text()).slice(0, 5 << 20) : ""; return { ok: r.ok, status: r.status, text }; } finally { clearTimeout(t); } };

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const baseUrl = argv.find((a, i) => /^https?:\/\//.test(a) && !argv[i - 1]?.startsWith("--"));
  if (!baseUrl) { console.error("usage: discover-pages.mjs <baseUrl> [--domain d] [--cap 40] [--json]"); return 2; }
  let keyurls = ""; if (opt("keyurls")) { try { keyurls = (await import("node:fs")).readFileSync(opt("keyurls"), "utf8"); } catch {} }
  const r = await resolvePaths({ envPaths: process.env.PLATFORM_GATE_PATHS, keyurls,
    discover: () => discoverPages({ baseUrl, siteHost: opt("domain"), fetchText: httpFetchText, renderedHrefs: argv.includes("--no-render") ? null : chromiumHrefs, cap: Number(opt("cap", DEFAULT_CAP)) || DEFAULT_CAP }) });
  if (argv.includes("--json")) console.log(JSON.stringify(r)); else if (!r.error) console.log(r.paths.join("\n"));
  if (r.error) { console.error(`DISCOVERY FAILED: ${r.error}`); return 4; }
  if (r.source !== "discovery") { console.error(`pages from ${r.source}: ${r.paths.length}`); return 0; }
  console.error(`discovered ${r.total} page(s) (sitemap ${r.sitemapPages}, home links ${r.homeLinks}${r.rendered ? " rendered" : ""})${r.capped ? `; CAPPED to ${r.cap}` : ""}`);
  return 0;
}
if (isMain(import.meta.url)) process.exit(await main(process.argv.slice(2)));
