import test from "node:test";
import assert from "node:assert/strict";
import { assetHtmlFallback, assetPaths, isHtml, KNOWN_ASSET_PATHS } from "../asset-html.mjs";
const probeMap = (m) => async (p) => { if (!(p in m)) return { status: 404, contentType: "text/plain" }; const v = m[p]; if (v instanceof Error) throw v; return v; };
test("known asset paths are always checked", () => {
  assert.deepEqual(assetPaths([], "https://s.com/", "s.com"), [...KNOWN_ASSET_PATHS].sort());
});
test("same-site script src and manifest href are added; off-site, non-asset and junk are not", () => {
  const p = assetPaths(["https://s.com/assets/app-1.js", "http://127.0.0.1:8787/x/manifest.json", "https://www.s.com/a.webmanifest", "https://cdn.other.com/lib.js", "https://s.com/style.css", "data:text/javascript,1", "/rel.js?v=2"], "http://127.0.0.1:8787/", "s.com");
  for (const x of ["/assets/app-1.js", "/x/manifest.json", "/a.webmanifest", "/rel.js?v=2"]) assert.ok(p.includes(x), x);
  assert.ok(!p.some((x) => /lib\.js|style\.css/.test(x)));
});
test("fails: /sw.js served as 200 text/html (earn.wiki SPA fallback)", async () => {
  const f = await assetHtmlFallback({ paths: ["/sw.js"], probe: probeMap({ "/sw.js": { status: 200, contentType: "text/html; charset=utf-8" } }) });
  assert.equal(f.length, 1); assert.equal(f[0].kind, "asset_html_fallback"); assert.match(f[0].defects[0], /\/sw\.js returned HTTP 200/);
});
test("fails: 404 with text/html", async () => {
  const f = await assetHtmlFallback({ paths: ["/manifest.json"], probe: probeMap({ "/manifest.json": { status: 404, contentType: "TEXT/HTML" } }) });
  assert.equal(f.length, 1); assert.equal(f[0].status, 404);
});
test("passes: real assets and plain 404s", async () => {
  const f = await assetHtmlFallback({ paths: ["/sw.js", "/manifest.json", "/site.webmanifest", "/manifest.webmanifest"], probe: probeMap({
    "/sw.js": { status: 200, contentType: "application/javascript" }, "/manifest.json": { status: 200, contentType: "application/json" },
    "/site.webmanifest": { status: 200, contentType: "application/manifest+json" }, "/manifest.webmanifest": { status: 404, contentType: "" } }) });
  assert.deepEqual(f, []);
});
test("fetch error is not a finding", async () => {
  assert.deepEqual(await assetHtmlFallback({ paths: ["/sw.js"], probe: probeMap({ "/sw.js": new Error("x") }) }), []);
});
test("isHtml", () => { assert.ok(isHtml("text/html")); assert.ok(!isHtml("application/xhtml+xml")); assert.ok(!isHtml(undefined)); assert.ok(!isHtml("text/htmlx")); });
// ---- narrowed rule (Keeper 2026-10-22) ----
import { assetPlan, swRegisterUrls, PROBE_PATHS, PWA_KIT_PATHS } from "../asset-html.mjs";
import { readFileSync } from "node:fs";
const run = async (referenced, pwaKit, map) => { const plan = assetPlan({ referenced, baseUrl: "https://s.com/", siteHost: "s.com", pwaKit }); return assetHtmlFallback({ paths: plan.block, warn: plan.warn, probe: probeMap(map) }); };
test("BLOCK: referenced home bundle served as 200 text/html (grocerydelivered stale hash)", async () => {
  const f = await run(["https://s.com/assets/index-BFUISclj.js"], false, { "/assets/index-BFUISclj.js": { status: 200, contentType: "text/html" } });
  assert.equal(f.length, 1); assert.equal(f[0].kind, "asset_html_fallback"); assert.equal(f[0].status, 200); assert.ok(f[0].defects.length);
});
test("BLOCK: referenced manifest served as 404 text/html", async () => {
  const f = await run(["https://s.com/app.webmanifest"], false, { "/app.webmanifest": { status: 404, contentType: "text/html; charset=utf-8" } });
  assert.equal(f.length, 1); assert.equal(f[0].status, 404);
});
test("WARN only: unreferenced probe paths returning text/html on a non-kit site", async () => {
  const html = { status: 200, contentType: "text/html" };
  const f = await run([], false, Object.fromEntries(PROBE_PATHS.map((p) => [p, html])));
  assert.equal(f.length, 0); assert.equal(f.warnings.length, PROBE_PATHS.length);
  for (const w of f.warnings) { assert.equal(w.kind, "asset_html_warn"); assert.deepEqual(w.defects, []); }
});
test("BLOCK: registered service worker /sw.js returning HTML (found in inline script)", async () => {
  const sw = swRegisterUrls([`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'})}`]);
  assert.deepEqual(sw, ["/sw.js"]);
  const f = await run(sw, false, { "/sw.js": { status: 200, contentType: "text/html" } });
  assert.equal(f.length, 1); assert.equal(f[0].route, "/sw.js"); assert.equal(f[0].kind, "asset_html_fallback");
  assert.ok(!f.warnings.some((w) => w.route === "/sw.js"));
});
test("swRegisterUrls: double quotes, backticks, minified bundle; ignores no-arg", () => {
  assert.deepEqual(swRegisterUrls([`navigator.serviceWorker.register("/a/sw.js")`, "n.serviceWorker.register(`/b.js`)", "x.serviceWorker.register(u)"]).sort(), ["/a/sw.js", "/b.js"]);
});
test("BLOCK: _pwaKit site — unlinked /sw.js and /manifest.webmanifest returning HTML block; other probes still warn", async () => {
  const html = { status: 200, contentType: "text/html" };
  const f = await run([], true, Object.fromEntries(PROBE_PATHS.map((p) => [p, html])));
  assert.deepEqual(f.map((x) => x.route).sort(), [...PWA_KIT_PATHS].sort());
  assert.deepEqual(f.warnings.map((x) => x.route).sort(), ["/manifest.json", "/site.webmanifest"]);
});
test("_pwaKit site with real kit passes; non-kit site same paths only warn", async () => {
  const ok = { "/sw.js": { status: 200, contentType: "application/javascript" }, "/manifest.webmanifest": { status: 200, contentType: "application/manifest+json" } };
  const f = await run([], true, ok); assert.equal(f.length, 0); assert.equal(f.warnings.length, 0);
  const g = await run([], false, { "/sw.js": { status: 404, contentType: "text/html" } }); assert.equal(g.length, 0); assert.equal(g.warnings.length, 1);
});
test("config: _pwaKit is set only on sites whose kit is live", () => {
  const cfg = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url), "utf8"));
  const kit = Object.keys(cfg).filter((k) => cfg[k]?._pwaKit === true).sort();
  assert.deepEqual(kit, ["partimepreneur.com", "quizbiz.org", "riskfreetrial.org", "watershortcut.com"]);
  for (const k of ["earn.wiki", "growth.business", "communityinternet.co"]) assert.ok(!cfg[k]?._pwaKit, k);
});
