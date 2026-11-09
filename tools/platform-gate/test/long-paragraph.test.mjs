import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { auditBlocks, domainConfig } from "../claims.mjs";
const { extractBlocks } = createRequire(import.meta.url)("../extract-blocks.js");
const cfgAll = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url)));
const now = new Date("2026-10-22T12:00:00Z");

// Minimal DOM: one visible <p> with no links/cites, as extractBlocks sees it in the page.
function fakePage(text, path = "/kb/sleep") {
  const p = { tagName: "P", innerText: text, parentElement: null, matches: (s) => /(^|,\s*)p(\s*,|$)/.test(s) && !/card|stat|tile/.test(s) ? true : false,
    closest: () => null, querySelectorAll: () => [], querySelector: () => null, getAttribute: () => null, getBoundingClientRect: () => ({ width: 300, height: 900 }) };
  p.matches = (s) => s.split(",").map((x) => x.trim()).includes("p");
  globalThis.document = { body: {}, querySelectorAll: () => [p] };
  globalThis.location = { hostname: "chatulah.com", href: `https://chatulah.com${path}`, pathname: path };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
}

const filler = "Cats often sleep through the afternoon and wake for the evening meal without much fuss. ";
const LONG = filler.repeat(14) + "Studies suggest 30-40% of adult cats are overweight. " + filler.repeat(10) + "About 90% of owners never weigh their cat. " + filler.repeat(4);

test("paragraph longer than 1500 chars is chunked, not dropped, and its figures are uncited claims", async () => {
  assert.ok(LONG.length > 2500, String(LONG.length));
  fakePage(LONG);
  const cfg = { ...domainConfig(cfgAll, "chatulah.com"), siteHost: "chatulah.com", ownPricePaths: [] };
  const blocks = extractBlocks(cfg);
  assert.ok(blocks.length >= 2, `expected chunks, got ${blocks.length}`);
  for (const b of blocks) assert.ok(b.text.length <= 1500, String(b.text.length));
  assert.equal(blocks.map((b) => b.text).join(" ").replace(/\s+/g, " "), LONG.trim().replace(/\s+/g, " "), "no text lost");
  const res = await auditBlocks(blocks, cfg, { now });
  const uncited = res.filter((c) => c.defects.includes("uncited")).map((c) => c.match);
  assert.ok(uncited.some((m) => /30-40%|40%/.test(m)), JSON.stringify(uncited));
  assert.ok(uncited.some((m) => /90%/.test(m)), JSON.stringify(uncited));
});
test("one over-long sentence is split at whitespace without cutting a number", () => {
  const s = ("word ".repeat(400) + "rose 37% ").repeat(2);
  fakePage(s);
  const blocks = extractBlocks({ siteHost: "chatulah.com", ownPricePaths: [] });
  assert.ok(blocks.length >= 2);
  assert.equal(blocks.filter((b) => /\b37%/.test(b.text)).length, 2);
  for (const b of blocks) assert.ok(b.text.length <= 1500);
});
test("short paragraph is a single unchanged block", () => {
  fakePage("Bills rose 12% last year.");
  const b = extractBlocks({ siteHost: "chatulah.com", ownPricePaths: [] });
  assert.deepEqual(b.map((x) => x.text), ["Bills rose 12% last year."]);
});
