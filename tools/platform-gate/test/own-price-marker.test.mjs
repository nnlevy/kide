import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { auditBlocks, domainConfig } from "../claims.mjs";
const { extractBlocks } = createRequire(import.meta.url)("../extract-blocks.js");
const cfgAll = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url)));
const now = new Date("2026-10-22T12:00:00Z");

// Tiny DOM: elements with tag, text, optional data-own-price, children, parent.
function el(tag, text, { marker = false, cls = "", children = [] } = {}) {
  const e = { tagName: tag.toUpperCase(), innerText: text, children, parentElement: null, cls, marker,
    getAttribute: (k) => (k === "data-own-price" && marker ? "" : k === "class" ? cls : null),
    getBoundingClientRect: () => ({ width: 200, height: 40 }) };
  for (const c of children) c.parentElement = e;
  const self = (s) => s.split(",").map((x) => x.trim()).some((x) => x === tag || (x === "[data-own-price]" && e.marker) || (/^\[class\*=/.test(x) && cls && cls.toLowerCase().includes(x.match(/=(\w+)/)[1].toLowerCase())));
  const desc = () => e.children.flatMap((c) => [c, ...c._desc()]);
  e._desc = desc;
  e.matches = self;
  e.closest = (s) => { for (let p = e; p; p = p.parentElement) if (p.matches && p.matches(s)) return p; return null; };
  e.querySelectorAll = (s) => desc().filter((d) => d.matches(s));
  e.querySelector = (s) => e.querySelectorAll(s)[0] || null;
  return e;
}
function page(roots) {
  const all = roots.flatMap((r) => [r, ...r._desc()]);
  globalThis.document = { body: {}, querySelectorAll: (s) => all.filter((d) => d.matches(s)) };
  globalThis.location = { hostname: "ex.com", href: "https://ex.com/", pathname: "/" };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
}
const cfg = { ...domainConfig(cfgAll, "ex.com"), siteHost: "ex.com", ownPricePaths: [] };
const uncited = async () => (await auditBlocks(extractBlocks(cfg), cfg, { now })).filter((c) => c.defects.includes("uncited")).map((c) => c.match);

test("currency inside [data-own-price] is exempt; price outside and non-price number inside are flagged", async () => {
  const pricedP = el("p", "Pro plan $149 per year, used by 4,000 teams", { marker: true });
  const outside = el("p", "Agencies usually charge $499 for this");
  const childP = el("p", "Starter $19 — or $199/mo for teams; 87% renew", { children: [el("span", "$19"), el("span", "$199/mo")] });
  childP.children.forEach((c) => (c.marker = true));
  page([pricedP, outside, childP]);
  const u = await uncited();
  assert.ok(!u.some((m) => m.includes("149")), JSON.stringify(u));
  assert.ok(!u.some((m) => /\$19\b|\$199/.test(m)), JSON.stringify(u));
  assert.ok(u.some((m) => m.includes("4,000")), "non-price number inside marker still counts: " + JSON.stringify(u));
  assert.ok(u.some((m) => m.includes("87%")), "percent next to marked prices still counts: " + JSON.stringify(u));
  assert.ok(u.some((m) => m.includes("$499")), "price outside marker is flagged: " + JSON.stringify(u));
});
test("pricing-looking class names without the marker are NOT exempt", async () => {
  page([el("p", "Only $29 today", { cls: "price pricing-card plan" })]);
  assert.ok((await uncited()).some((m) => m.includes("$29")));
});
test("marked $19 does not exempt an unmarked $199 or a second unmarked $19", async () => {
  const p = el("p", "Ours is $19. Theirs is $199 and others $19 too", { children: [el("span", "$19")] }); p.children[0].marker = true;
  page([p]);
  const u = await uncited();
  assert.ok(u.some((m) => m.includes("$199")), JSON.stringify(u));
  assert.equal(u.filter((m) => /^\$19$/.test(m)).length, 1, JSON.stringify(u));
});
