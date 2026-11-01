#!/usr/bin/env node
/**
 * Domains platform shared pre-ship gate. Read-only GET loads; never submits, never deploys.
 *   node tools/platform-gate/gate.mjs https://site/ [more] --out DIR [--strict] [--mobile-devices a,b] [--no-mobile]
 *        [--claims-json page-claims.json] [--require-metadata] [--check-sources]
 * Checks: (1) strict mobile 15-profile matrix (mobile-strict.mjs: taps>=44x44, text>=12px, no overflow incl. 200% text,
 * axe critical, CLS); (2) claims: every visible claim (figure, ranking, legal rule, present-tense status) needs a citation in
 * its paragraph/card (external <a>, <cite>, footnote ref, data-source). With --require-metadata also source_url/as_of/
 * recheck_by/tier, tier max interval, past recheck_by, and (--check-sources) stored source quote/hash still matching.
 * --domain example.com evaluates a local/preview URL with that site's config (own-domain + own-price rules).
 * (3) billing-provider text: visible copy must not name an own portfolio domain as billing/credits provider (attributes ignored).
 * (4) orphan_tools: on the home URL, every LIVE tool route (config _toolRoutes + sitemap pattern matches) needs >=1 link
 *     from the rendered home DOM (incl. nav). Zero inbound links = an orphan_tools finding (fails --strict). --no-orphan-tools skips.
 * (5) asset_html_fallback: on the home URL, same-site script src / manifest href / registered service worker ending
 *     .js/.json/.webmanifest (+ /sw.js, /manifest.webmanifest when config _pwaKit) must not answer text/html (any status) -> BLOCK.
 *     Unreferenced probe paths (/sw.js, manifests) answering text/html -> asset_html_warn (no defect). --no-asset-html skips.
 * (6) js_error: any uncaught page error / SyntaxError during the page load fails (--strict). Errors whose stack points only at
 *     third-party scripts (AdSense, Cloudflare beacon /cdn-cgi/, other hosts) are ignored and listed in result.jsErrorsIgnored.
 * Per-domain exemptions: config/domains.json (ownPrices, ownSkus, ownPricePaths, allowPatterns, allowPages).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { auditBlocks, domainConfig } from "./claims.mjs";
import { sameSite } from "./same-site.mjs";
import { billingProviderLeaks } from "./billing-provider.mjs";
import { orphanTools, toolRoutesFor, sitemapPaths } from "./orphan-tools.mjs";
import { jsErrorFindings } from "./js-errors.mjs";
import { blockRum } from "./rum-block.mjs";
import { assetHtmlFallback, assetPlan, isHtml, referencedPaths, swRegisterUrls } from "./asset-html.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const { extractBlocks } = createRequire(import.meta.url)("./extract-blocks.js");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);
const urls = argv.filter((a, i) => /^https?:\/\//.test(a) && !argv[i - 1]?.startsWith("--"));
const OUT = opt("out", "platform-gate-results"); mkdirSync(OUT, { recursive: true });
const cfgAll = JSON.parse(readFileSync(opt("config", join(HERE, "config", "domains.json")), "utf8"));
const claimsJson = opt("claims-json") && existsSync(opt("claims-json")) ? JSON.parse(readFileSync(opt("claims-json"), "utf8")) : null;
const result = { at: new Date().toISOString(), urls, mobile: null, claims: [] };

if (!has("no-mobile")) {
  const args = [join(HERE, "mobile-strict.mjs"), ...urls, "--out", join(OUT, "mobile")]; if (opt("mobile-devices")) args.push("--devices", opt("mobile-devices"));
  const r = spawnSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }); process.stdout.write(r.stdout || "");
  try { const rows = JSON.parse(readFileSync(join(OUT, "mobile", "report.json"), "utf8")); result.mobile = { pass: rows.filter((x) => !x.defects.length).length, total: rows.length, failing: rows.filter((x) => x.defects.length).map((x) => ({ device: x.device, url: x.url, defects: x.defects })) }; } catch (e) { result.mobile = { error: String(e.message) }; }
}

const { chromium } = await import("playwright");
const browser = await chromium.launch();
for (const url of urls) {
  const host = (opt("domain") || new URL(url).hostname).replace(/^www\./, ""); const cfg = { ...domainConfig(cfgAll, host), siteHost: host };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await blockRum(ctx, "desktop"); const page = await ctx.newPage();
  const pageErrors = []; page.on("pageerror", (e) => pageErrors.push({ name: e.name, message: e.message, stack: e.stack }));
  try { await page.goto(url, { waitUntil: "load", timeout: 60000 }); await page.waitForTimeout(2500);
    if (!sameSite(url, page.url())) throw new Error(`redirected off-origin: ${url} -> ${page.url()} (refusing to audit a different site than requested)`);
    if (!has("no-js-errors")) { const js = jsErrorFindings(pageErrors, url, host); result.claims.push(...js.findings); (result.jsErrorsIgnored ||= []).push(...js.ignored);
      for (const i of js.ignored) console.log(`  js_error ignored (third-party ${i.source}): ${i.name}: ${i.message}`); }
    const blocks = await page.evaluate(extractBlocks, cfg);
    const fetchSource = has("check-sources") ? async (u) => (await fetch(u)).text() : null;
    const claims = await auditBlocks(blocks, cfg, { requireMetadata: has("require-metadata"), fetchSource, claimsJson });
    result.claims.push(...claims);
    const visible = await page.evaluate(() => document.body?.innerText || ""); // visible text only, never attributes
    result.claims.push(...billingProviderLeaks(visible, cfg.portfolioDomains).map((c) => ({ ...c, page: url, text: c.match })));
    if (new URL(url).pathname === "/" && !has("no-orphan-tools")) { // (4) orphan_tools: live tool routes need a home/nav link
      const origin = new URL(url).origin;
      const sm = await fetch(`${origin}/sitemap.xml`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
      const toolRoutes = toolRoutesFor(cfgAll, host, sitemapPaths(sm));
      const homeHrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
      const statusOf = async (p) => (await fetch(origin + p, { redirect: "follow" })).status;
      result.orphanTools = { toolRoutes, findings: await orphanTools({ toolRoutes, homeHrefs, baseUrl: url, siteHost: host, statusOf }) };
      result.claims.push(...result.orphanTools.findings.map((c) => ({ ...c, page: url })));
    }
    if (new URL(url).pathname === "/" && !has("no-asset-html")) { // (5) asset_html_fallback: assets must not be served as text/html
      const origin = new URL(url).origin;
      const dom = await page.evaluate(() => ({ srcs: [...document.querySelectorAll("script[src]")].map((s) => s.src), manifests: [...document.querySelectorAll("link[rel~=manifest][href]")].map((l) => l.href), inline: [...document.querySelectorAll("script:not([src])")].map((s) => s.textContent || "") }));
      const probe = async (p) => { const r = await fetch(origin + p, { redirect: "follow" }); const out = { status: r.status, contentType: r.headers.get("content-type") || "" }; try { await r.body?.cancel(); } catch {} return out; };
      const sameSiteJs = referencedPaths(dom.srcs, url, host).slice(0, 20);
      const bundleTexts = await Promise.all(sameSiteJs.map((p) => fetch(origin + p).then((r) => (isHtml(r.headers.get("content-type")) ? "" : r.text())).catch(() => "")));
      const referenced = [...dom.srcs, ...dom.manifests, ...swRegisterUrls([...dom.inline, ...bundleTexts])];
      const pwaKit = !!(cfgAll[host]?._pwaKit || cfgAll[host.replace(/^www\./, "")]?._pwaKit);
      const plan = assetPlan({ referenced, baseUrl: url, siteHost: host, pwaKit });
      const res = await assetHtmlFallback({ paths: plan.block, warn: plan.warn, probe });
      result.assetHtml = { pwaKit, ...plan, findings: [...res], warnings: res.warnings };
      result.claims.push(...res.warnings.map((c) => ({ ...c, page: url })));
      result.claims.push(...result.assetHtml.findings.map((c) => ({ ...c, page: url })));
    }
  } catch (e) { result.claims.push({ page: url, kind: "error", defects: [`load failed: ${String(e.message).split("\n")[0]}`] }); }
  await ctx.close();
}
await browser.close();
const failing = result.claims.filter((c) => c.defects?.length);
result.summary = { js_error: result.claims.filter((c) => c.kind === "js_error").length, js_error_ignored: (result.jsErrorsIgnored || []).length, orphan_tools: result.claims.filter((c) => c.kind === "orphan_tools").length, asset_html_fallback: result.claims.filter((c) => c.kind === "asset_html_fallback").length, asset_html_warn: result.claims.filter((c) => c.kind === "asset_html_warn").length, claims: result.claims.length, uncited: result.claims.filter((c) => c.defects?.includes("uncited")).length, failing: failing.length, mobile: result.mobile && `${result.mobile.pass}/${result.mobile.total}` };
writeFileSync(join(OUT, "gate.json"), JSON.stringify(result, null, 1));
console.log(`claims: ${result.summary.claims}, uncited: ${result.summary.uncited}, failing: ${failing.length}; mobile ${result.summary.mobile}`);
for (const c of failing.slice(0, 10)) console.log(`  CLAIM ${c.defects.join("; ")} :: "${c.match}" in "${(c.text || "").slice(0, 90)}"`);
if (has("strict") && (failing.length || (result.mobile && result.mobile.pass !== result.mobile.total))) process.exit(1);
