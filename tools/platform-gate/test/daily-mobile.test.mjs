import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveSites, patternHost, tomlRoutes } from "../live-sites.mjs";
import { siteVerdict } from "../daily-mobile.mjs";

function ws(repos) {
  const d = mkdtempSync(join(tmpdir(), "ws-"));
  for (const [name, files] of Object.entries(repos)) { mkdirSync(join(d, name)); for (const [f, c] of Object.entries(files)) writeFileSync(join(d, name, f), c); }
  return d;
}

// Regression: earn.wiki (repo earnwikinew) was live at 0/15 but missing from the hand-kept core-homes.txt.
test("site list comes from wrangler routes, including earn.wiki from a jsonc config with comments", () => {
  const d = ws({
    earnwikinew: { "wrangler.jsonc": `{ // comment\n "name": "earnwikinew", "routes": [ { "pattern": "earn.wiki/*", "zone_name": "earn.wiki" }, { "pattern": "www.earn.wiki/*", "zone_name": "earn.wiki" }, ], }` , "wrangler.toml": `name = "old"\n[[routes]]\npattern = "stale.example/*"\n` },
    riskfreetrial: { "wrangler.json": JSON.stringify({ name: "rft", routes: [{ pattern: "riskfreetrial.org", custom_domain: true }, { pattern: "www.riskfreetrial.org", custom_domain: true }] }) },
    hwj: { "wrangler.toml": `name = "hwj"\nworkers_dev = true\n[[routes]]\npattern = "www.healthwellnessjobs.com/*"\nzone_name = "healthwellnessjobs.com"\n[env.staging]\nroute = "staging.example.com/*"\n` },
    notasite: { "README.md": "x" },
  });
  const { sites, errors } = liveSites(d);
  assert.deepEqual(errors, []);
  assert.deepEqual(sites.map((s) => [s.site, s.url]), [
    ["earn.wiki", "https://earn.wiki/"],
    ["healthwellnessjobs.com", "https://www.healthwellnessjobs.com/"],
    ["riskfreetrial.org", "https://riskfreetrial.org/"],
  ]);
});

test("an unreadable wrangler config is reported as an error, never dropped", () => {
  const d = ws({ broken: { "wrangler.json": "{ not json" }, ok: { "wrangler.json": '{"routes":["ok.com/*"]}' } });
  const { sites, errors } = liveSites(d);
  assert.equal(sites.length, 1);
  assert.equal(errors.length, 1); assert.equal(errors[0].repo, "broken");
});

test("wildcards and workers.dev are not sites", () => {
  assert.equal(patternHost("*.earn.wiki/*"), null);
  assert.equal(patternHost("x.quizbiz.workers.dev/*"), null);
  assert.equal(patternHost("https://www.a.com/path*"), "www.a.com");
  assert.deepEqual(tomlRoutes(`route = "a.com/*"\nroutes = [ "b.com/*", { pattern = "c.com/*" } ]\n[env.x]\nroute = "d.com/*"`), ["a.com/*", "b.com/*", "c.com/*"]);
});

test("unreachable, crashed, killed or partial runs are failures, never skips", () => {
  const rows15 = Array.from({ length: 15 }, (_, i) => ({ device: `d${i}`, defects: [] }));
  assert.equal(siteVerdict({ status: 0, rows: rows15 }).ok, true);
  assert.equal(siteVerdict({ status: 1, rows: undefined }).ok, false);
  assert.equal(siteVerdict({ status: null, signal: "SIGTERM", rows: rows15 }).ok, false);
  assert.equal(siteVerdict({ error: "spawn ETIMEDOUT" }).ok, false);
  assert.equal(siteVerdict({ status: 0, rows: rows15.slice(0, 3) }).ok, false);
  assert.equal(siteVerdict({ status: 0, rows: [] }).ok, false);
  const unreachable = rows15.map((r) => ({ ...r, defects: ["load failed: net::ERR_NAME_NOT_RESOLVED"] }));
  const v = siteVerdict({ status: 1, rows: unreachable });
  assert.equal(v.ok, false); assert.match(v.reason, /^0\/15/);
  assert.equal(siteVerdict({ status: 1, rows: rows15 }).ok, false);
});

test("mobile-strict counts axe errors and rejects unknown devices instead of skipping", () => {
  const src = readFileSync(new URL("../mobile-strict.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /catch \{ row\.axe = \[\]; \}/);
  assert.match(src, /unknown device\(s\)/);
});

import { registrySites, allLiveSites } from "../live-sites.mjs";
const reg = (rows, status = "ok") => ({ schema: "live-truth/domains/v1", status, rows });

test("Cloudflare registry adds sites served only by dashboard custom domains (e.g. healthwellnessjobs)", () => {
  const d = ws({ earnwikinew: { "wrangler.json": '{"routes":[{"pattern":"earn.wiki/*"}]}' } });
  const registry = reg([
    { domain: "healthwellnessjobs.com", on_cloudflare: true, zone_status: "active", routes: [], custom_domains: [{ hostname: "www.healthwellnessjobs.com", service: "hwj" }] },
    { domain: "parked.com", on_cloudflare: true, zone_status: "active", routes: [], custom_domains: [] },
    { domain: "gone.com", on_cloudflare: false, routes: [], custom_domains: [] },
    { domain: "skip.com", on_cloudflare: true, zone_status: "active", flags: ["excluded"], routes: [], custom_domains: [{ hostname: "skip.com" }] },
  ]);
  const { sites, errors } = allLiveSites({ workspace: d, registry });
  assert.deepEqual(errors, []);
  assert.deepEqual(sites.map((s) => [s.site, s.url]), [["earn.wiki", "https://earn.wiki/"], ["healthwellnessjobs.com", "https://www.healthwellnessjobs.com/"]]);
});

test("a missing or not-ok registry is an error (a failure), and the wrangler list is still checked", () => {
  const d = ws({ earnwikinew: { "wrangler.json": '{"routes":[{"pattern":"earn.wiki/*"}]}' } });
  for (const r of [null, reg([], "token_missing"), reg([])]) {
    const { sites, errors } = allLiveSites({ workspace: d, registry: r });
    assert.equal(sites.length, 1); assert.equal(errors.length, 1); assert.equal(errors[0].repo, "cloudflare-registry");
  }
  assert.throws(() => registrySites(reg([{ domain: "a.com", on_cloudflare: true, zone_status: "active", routes: null, custom_domains: [] }])), /unknown/);
});

test("multi-line toml routes arrays are read (grocerydelivered/industrialrefurbisher shape)", () => {
  assert.deepEqual(tomlRoutes(`name = "g"\nroutes = [\n  { pattern = "g.org/*", zone_name = "g.org" },\n  { pattern = "www.g.org", zone_name = "g.org", custom_domain = true }\n]\n`), ["g.org/*", "www.g.org"]);
});
