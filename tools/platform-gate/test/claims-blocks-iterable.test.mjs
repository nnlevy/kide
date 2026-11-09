// Regression (claims-fix over ab09c0c): a page that patches Array.isArray / Object.keys / toJSON made Playwright
// return the block array as a plain object, and gate.mjs reported "load failed: blocks is not iterable" on
// every page, silently disabling uncited-claim checks. Blocks must survive transport and still be audited.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { auditBlocks, domainConfig } from "../claims.mjs";
const { extractBlocks, serializeBlocks, parseBlocks, extractBlocksExpr } = createRequire(import.meta.url)("../extract-blocks.js");
const cfg = { ...domainConfig({}, "ex.com"), siteHost: "ex.com" };
const now = new Date("2026-10-22T12:00:00Z");

test("auditBlocks rejects non-arrays loudly instead of 'blocks is not iterable'", async () => {
  for (const bad of [undefined, null, { 0: { text: "Save 30%" } }, "[]"]) await assert.rejects(auditBlocks(bad, cfg, { now }), /expected an array of blocks/);
  assert.deepEqual(await auditBlocks([], cfg, { now }), []);
});
test("parseBlocks: JSON string round-trips; non-array fails with a clear message", () => {
  assert.deepEqual(parseBlocks('[{"text":"a","links":["https://x.org"]}]'), [{ text: "a", links: ["https://x.org"] }]);
  assert.throws(() => parseBlocks('{"0":{}}'), /expected an array of blocks/);
  assert.throws(() => parseBlocks(undefined), /expected an array of blocks/);
});
test("serializeBlocks ignores patched Array.isArray / Object.keys / toJSON", () => {
  const saved = { isArray: Array.isArray, keys: Object.keys };
  try {
    Array.isArray = () => false; Object.keys = () => []; Array.prototype.toJSON = function () { return "x"; }; Object.prototype.toJSON = function () { return undefined; };
    const s = serializeBlocks([{ text: 'He said "9 GPUs"', links: ["https://epa.gov"], attrs: { "data-source": "EPA" }, n: 2 }]);
    delete Array.prototype.toJSON; delete Object.prototype.toJSON; Array.isArray = saved.isArray; Object.keys = saved.keys;
    assert.deepEqual(JSON.parse(s), [{ text: 'He said "9 GPUs"', links: ["https://epa.gov"], attrs: { "data-source": "EPA" }, n: 2 }]);
  } finally { delete Array.prototype.toJSON; delete Object.prototype.toJSON; Array.isArray = saved.isArray; Object.keys = saved.keys; }
});
test("browser: page that patches Array.isArray still yields audited claims (gate.mjs path)", async (t) => {
  let chromium; try { ({ chromium } = await import("playwright")); } catch { return t.skip("playwright not installed"); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>Array.isArray=()=>false;Object.keys=()=>[];Object.prototype.toJSON=function(){}</script>
      <p>Households waste 9,400 gallons a year.</p><p>Bills rose 12% <a href="https://epa.gov/x">EPA</a></p>`);
    const raw = await page.evaluate(extractBlocks, cfg); // the old transport: proves the page shape breaks it
    assert.ok(!Array.isArray(raw), "precondition: old transport returns a non-array on this page");
    const blocks = parseBlocks(await page.evaluate(extractBlocksExpr(cfg)));
    assert.equal(blocks.length, 2); assert.deepEqual(blocks[1].links, ["https://epa.gov/x"]);
    const claims = await auditBlocks(blocks, cfg, { now });
    assert.deepEqual(claims.filter((c) => c.defects.includes("uncited")).map((c) => c.match), ["9,400 gallons"]);
  } finally { await browser.close(); }
});
