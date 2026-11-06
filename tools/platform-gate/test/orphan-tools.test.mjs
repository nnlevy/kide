import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orphanTools, toolRoutesFor, sitemapPaths, inboundPaths } from "../orphan-tools.mjs";
const cfg = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url)));
const live = async () => 200;
test("config lists trycrm and checkinforwork tool routes", () => {
  assert.deepEqual(toolRoutesFor(cfg, "trycrm.co"), ["/field-sales-diagnosis", "/field-sales-morning-ritual"]);
  assert.deepEqual(toolRoutesFor(cfg, "www.checkinforwork.com"), ["/crew-missed-checkin"]);
});
test("sitemap paths matching tool patterns are tool routes", () => {
  const xml = "<urlset><url><loc>https://x.com/</loc></url><url><loc>https://x.com/roi-calculator/</loc></url><url><loc>https://x.com/tools/heat</loc></url><url><loc>https://x.com/privacy</loc></url></urlset>";
  assert.deepEqual(toolRoutesFor(cfg, "x.com", sitemapPaths(xml)), ["/roi-calculator", "/tools/heat"]);
});
test("fails: SPA home linking only /build /privacy /terms orphans both trycrm tools", async () => {
  const f = await orphanTools({ toolRoutes: toolRoutesFor(cfg, "trycrm.co"), homeHrefs: ["https://trycrm.co/build", "https://trycrm.co/privacy", "https://trycrm.co/terms"], baseUrl: "https://trycrm.co/", siteHost: "trycrm.co", statusOf: live });
  assert.equal(f.length, 2); assert.ok(f.every((x) => x.kind === "orphan_tools" && /zero inbound links/.test(x.defects[0])));
});
test("passes: tool linked from home (trailing slash, query, www, local preview origin all count)", async () => {
  const f = await orphanTools({ toolRoutes: ["/a-tool", "/b-tool", "/c-tool"], homeHrefs: ["http://127.0.0.1:8787/a-tool/", "https://www.site.com/b-tool?x=1", "/c-tool#top"], baseUrl: "http://127.0.0.1:8787/", siteHost: "site.com", statusOf: live });
  assert.deepEqual(f, []);
});
test("link to the same path on another domain does not count", async () => {
  const f = await orphanTools({ toolRoutes: ["/crew-missed-checkin"], homeHrefs: ["https://other.example/crew-missed-checkin"], baseUrl: "https://checkinforwork.com/", siteHost: "checkinforwork.com", statusOf: live });
  assert.equal(f.length, 1);
});
test("non-live tool route (404 / fetch error) is not an orphan", async () => {
  assert.deepEqual(await orphanTools({ toolRoutes: ["/gone-tool"], homeHrefs: [], baseUrl: "https://s.com/", siteHost: "s.com", statusOf: async () => 404 }), []);
  assert.deepEqual(await orphanTools({ toolRoutes: ["/gone-tool"], homeHrefs: [], baseUrl: "https://s.com/", siteHost: "s.com", statusOf: async () => { throw new Error("x"); } }), []);
});
test("inboundPaths ignores junk hrefs", () => assert.deepEqual([...inboundPaths(["mailto:a@b", "javascript:void(0)", "https://s.com/"], "https://s.com/", "s.com")], ["/"]));
test("bare repo name resolves to its configured domain", () => assert.deepEqual(toolRoutesFor(cfg, "trycrm"), ["/field-sales-diagnosis", "/field-sales-morning-ritual"]));
