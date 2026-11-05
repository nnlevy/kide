import test from "node:test";
import assert from "node:assert/strict";
import { parseSitemap, hrefsFromHtml, samePath, dedupeCap, discoverPages, normPath, resolvePaths } from "../discover-pages.mjs";
const site = (files) => async (u) => { const p = new URL(u).pathname; return p in files ? { ok: true, status: 200, text: files[p] } : { ok: false, status: 404, text: "" }; };
const urlset = (...l) => `<?xml version="1.0"?><urlset>${l.map((x) => `<url><loc>${x}</loc></url>`).join("")}</urlset>`;

test("parseSitemap splits pages from nested sitemap indexes", () => {
  const idx = parseSitemap(`<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`);
  assert.deepEqual(idx, { pages: [], sitemaps: ["https://a.com/s1.xml"], isSitemap: true });
  assert.deepEqual(parseSitemap(urlset("https://a.com/x", "https://a.com/y?a=1&amp;b=2")).pages, ["https://a.com/x", "https://a.com/y?a=1&b=2"]);
  assert.equal(parseSitemap("<html>not found</html>").isSitemap, false);
});
test("same-origin filter: apex/www of the audited domain and the base origin; skips assets and other hosts", () => {
  assert.equal(samePath("https://www.a.com/pricing/", "http://127.0.0.1:8787/", "a.com"), "/pricing");
  assert.equal(samePath("/tools/x?q=1#h", "https://a.com/", "a.com"), "/tools/x");
  assert.equal(samePath("https://b.com/", "https://a.com/", "a.com"), null);
  assert.equal(samePath("https://sub.a.com/", "https://a.com/", "a.com"), null);
  assert.equal(samePath("mailto:x@a.com", "https://a.com/", "a.com"), null);
  assert.equal(samePath("/logo.png", "https://a.com/", "a.com"), null);
  assert.equal(normPath("/a//"), "/a");
});
test("hrefsFromHtml reads quoted and unquoted hrefs", () => {
  assert.deepEqual(hrefsFromHtml(`<a href="/a">x</a><a class=c href='/b'>y</a><a href=/c>z</a>`), ["/a", "/b", "/c"]);
});
test("dedupe keeps '/' first and caps, reporting the cap", () => {
  const r = dedupeCap(Array.from({ length: 60 }, (_, i) => `/p${i % 50}`), 40);
  assert.equal(r.paths[0], "/"); assert.equal(r.paths.length, 40); assert.equal(r.total, 51); assert.equal(r.capped, true);
  assert.equal(dedupeCap(["/a", "/a"]).capped, false);
});
test("discovery follows nested sitemap indexes and merges home links, deduped", async () => {
  const r = await discoverPages({ baseUrl: "http://127.0.0.1:9/", siteHost: "a.com", fetchText: site({
    "/sitemap.xml": `<sitemapindex><sitemap><loc>https://a.com/sm-pages.xml</loc></sitemap><sitemap><loc>https://evil.com/x.xml</loc></sitemap></sitemapindex>`,
    "/sm-pages.xml": urlset("https://a.com/", "https://www.a.com/about", "https://a.com/pricing/"),
    "/": `<a href="/about">a</a><a href="/contact">c</a><a href="https://other.com/z">o</a>` }) });
  assert.deepEqual(r.paths, ["/", "/about", "/pricing", "/contact"]);
  assert.equal(r.sitemapFound, true); assert.equal(r.error, null);
});
test("home links alone are enough when there is no sitemap", async () => {
  const r = await discoverPages({ baseUrl: "https://a.com/", fetchText: site({ "/": `<a href="/x">x</a>` }) });
  assert.deepEqual(r.paths, ["/", "/x"]); assert.equal(r.sitemapFound, false); assert.equal(r.error, null);
});
test("JS-rendered home links are used only when the static HTML has none", async () => {
  let n = 0; const renderedHrefs = async () => { n++; return ["https://a.com/app", "https://x.com/"]; };
  const r = await discoverPages({ baseUrl: "https://a.com/", fetchText: site({ "/": "<div id=root></div>" }), renderedHrefs });
  assert.deepEqual(r.paths, ["/", "/app"]); assert.equal(r.rendered, true); assert.equal(n, 1);
  await discoverPages({ baseUrl: "https://a.com/", fetchText: site({ "/": `<a href="/s">s</a>` }), renderedHrefs }); assert.equal(n, 1);
});
test("no sitemap and no same-origin links -> clear discovery failure", async () => {
  const r = await discoverPages({ baseUrl: "https://a.com/", fetchText: site({ "/": `<a href="https://b.com/">b</a>`, "/sitemap.xml": "<html>soft 404</html>" }) });
  assert.match(r.error, /no sitemap at https:\/\/a\.com\/sitemap\.xml and no same-origin links on https:\/\/a\.com\//);
  const down = await discoverPages({ baseUrl: "https://a.com/", fetchText: async () => { throw new Error("ECONNREFUSED"); } });
  assert.match(down.error, /home HTTP 0/);
});
test("caps large sitemaps at 40 by default", async () => {
  const r = await discoverPages({ baseUrl: "https://a.com/", fetchText: site({ "/sitemap.xml": urlset(...Array.from({ length: 120 }, (_, i) => `https://a.com/p${i}`)) }) });
  assert.equal(r.paths.length, 40); assert.equal(r.capped, true); assert.equal(r.total, 121);
});
test("explicit PLATFORM_GATE_PATHS and keyurls take precedence over discovery", async () => {
  let called = 0; const discover = async () => { called++; return { paths: ["/", "/d"], error: null }; };
  assert.deepEqual(await resolvePaths({ envPaths: "/ /pricing", keyurls: "/ /k", discover }), { source: "PLATFORM_GATE_PATHS", paths: ["/", "/pricing"], error: null });
  assert.deepEqual(await resolvePaths({ envPaths: "", keyurls: "/ /how-it-works\n", discover }), { source: "keyurls", paths: ["/", "/how-it-works"], error: null });
  assert.equal(called, 0);
  const d = await resolvePaths({ envPaths: " ", keyurls: "", discover }); assert.equal(d.source, "discovery"); assert.deepEqual(d.paths, ["/", "/d"]); assert.equal(called, 1);
});
test("CLI: env paths are printed verbatim; no URL prints usage", async () => {
  const { spawnSync } = await import("node:child_process"); const cli = new URL("../discover-pages.mjs", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [cli, "http://127.0.0.1:9/"], { encoding: "utf8", env: { ...process.env, PLATFORM_GATE_PATHS: "/ /x" } });
  assert.equal(r.status, 0); assert.equal(r.stdout.trim(), "/\n/x");
  const u = spawnSync(process.execPath, [cli], { encoding: "utf8" }); assert.equal(u.status, 2); assert.match(u.stderr, /usage/);
});
test("CLI: unreachable base with no explicit list fails with exit 4 and a clear line", async () => {
  const { spawnSync } = await import("node:child_process"); const cli = new URL("../discover-pages.mjs", import.meta.url).pathname;
  const env = { ...process.env }; delete env.PLATFORM_GATE_PATHS;
  const r = spawnSync(process.execPath, [cli, "http://127.0.0.1:9/", "--no-render"], { encoding: "utf8", env });
  assert.equal(r.status, 4); assert.match(r.stderr, /DISCOVERY FAILED: no sitemap at .* and no same-origin links/);
});
