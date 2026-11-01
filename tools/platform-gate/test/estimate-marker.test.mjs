import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { auditBlocks, domainConfig } from "../claims.mjs";
const { extractBlocks } = createRequire(import.meta.url)("../extract-blocks.js");
const cfgAll = JSON.parse(readFileSync(new URL("../config/domains.json", import.meta.url)));
const now = new Date("2026-10-22T12:00:00Z");

// Minimal DOM with a tiny selector engine: tag, [attr], [attr=v], [attr^=v], [attr*=v], comma lists.
function matchOne(e, sel) {
  const m = sel.trim().match(/^([a-z0-9]*)((?:\[[^\]]+\])*)$/i); if (!m) return false;
  if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
  for (const [, name, op, raw] of m[2].matchAll(/\[([\w-]+)(?:([\^*]?=)"?([^"\]]*)"?)?\]/g)) {
    const v = e.getAttribute(name); if (v == null) return false;
    if (op === "=" && v !== raw) return false; if (op === "^=" && !v.startsWith(raw)) return false; if (op === "*=" && !v.toLowerCase().includes(raw.toLowerCase())) return false;
  }
  return true;
}
function el(tag, text, attrs = {}, children = []) {
  const e = { tagName: tag.toUpperCase(), attrs, children, parentElement: null, getBoundingClientRect: () => ({ width: 200, height: 40 }) };
  e.innerText = e.textContent = text ?? children.map((c) => c.innerText).join(" ");
  e.getAttribute = (k) => (k in attrs ? String(attrs[k]) : null);
  if (attrs.href) e.href = new URL(attrs.href, "https://ex.com/").href;
  for (const c of children) c.parentElement = e;
  e._desc = () => e.children.flatMap((c) => [c, ...c._desc()]);
  e.matches = (s) => s.split(",").some((x) => matchOne(e, x));
  e.closest = (s) => { for (let p = e; p; p = p.parentElement) if (p.matches(s)) return p; return null; };
  e.querySelectorAll = (s) => e._desc().filter((d) => d.matches(s));
  e.querySelector = (s) => e.querySelectorAll(s)[0] || null;
  return e;
}
function page(roots) {
  const all = roots.flatMap((r) => [r, ...r._desc()]);
  globalThis.document = { body: {}, querySelectorAll: (s) => all.filter((d) => d.matches(s)), getElementById: (id) => all.find((d) => d.getAttribute("id") === id) || null };
  globalThis.location = { hostname: "ex.com", href: "https://ex.com/", pathname: "/" };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
}
const cfg = { ...domainConfig(cfgAll, "ex.com"), siteHost: "ex.com", ownPricePaths: [] };
const uncited = async () => (await auditBlocks(extractBlocks(cfg), cfg, { now })).filter((c) => c.defects.includes("uncited")).map((c) => c.match);
const out = (attrs, value = "Your estimate: $312,000 home price, 28% of income") => el("p", value, { "data-estimate": "", ...attrs });
const citedRate = () => el("label", null, { for: "rate" }, [el("span", "Rate (Freddie Mac PMMS)"), el("a", "PMMS", { href: "https://www.freddiemac.com/pmms" })]);

test("marked output with every input cited is skipped", async () => {
  page([citedRate(), el("input", "", { id: "rate" }), el("input", "", { id: "dti", "data-source": "https://www.consumerfinance.gov/x" }), out({ "data-estimate-inputs": "rate dti" })]);
  assert.deepEqual(await uncited(), []);
});
test("footnote ref and own-domain link: footnote counts, own-domain link does not", async () => {
  page([el("p", null, {}, [el("input", "", { id: "a" }), el("a", "1", { href: "#fn1", role: "doc-noteref" })]), el("input", "", { id: "b", "data-source": "https://ex.com/guide" }), out({ "data-estimate-inputs": "a b" })]);
  assert.ok((await uncited()).some((m) => m.includes("312,000")), "input b is only cited to the site itself");
});
test("marked but an input is uncited: output still flagged", async () => {
  page([citedRate(), el("input", "", { id: "rate" }), el("input", "", { id: "dti" }), out({ "data-estimate-inputs": "rate dti" })]);
  const u = await uncited();
  assert.ok(u.some((m) => m.includes("312,000")) && u.some((m) => m.includes("28%")), JSON.stringify(u));
});
test("marked with no declared inputs, a missing input id, or no visible label: still flagged", async () => {
  page([out({})]); assert.ok((await uncited()).some((m) => m.includes("312,000")));
  page([citedRate(), el("input", "", { id: "rate" }), out({ "data-estimate-inputs": "rate gone" })]); assert.ok((await uncited()).some((m) => m.includes("312,000")));
  page([citedRate(), el("input", "", { id: "rate" }), out({ "data-estimate-inputs": "rate" }, "$312,000 home price")]); assert.ok((await uncited()).some((m) => m.includes("312,000")));
});
test("unmarked output is flagged even with cited inputs", async () => {
  page([citedRate(), el("input", "", { id: "rate" }), el("p", "Your estimate: $312,000 home price", { "data-estimate-inputs": "rate" })]);
  assert.ok((await uncited()).some((m) => m.includes("312,000")));
});
test("only the marked output is exempt: an unmarked figure in the same paragraph is flagged", async () => {
  page([citedRate(), el("input", "", { id: "rate" }), el("p", null, {}, [el("span", "Your estimate: $312,000", { "data-estimate": "", "data-estimate-inputs": "rate" }), el("span", "most buyers put 20% down")])]);
  const u = await uncited();
  assert.ok(!u.some((m) => m.includes("312,000")), JSON.stringify(u));
  assert.ok(u.some((m) => m.includes("20%")), JSON.stringify(u));
});
