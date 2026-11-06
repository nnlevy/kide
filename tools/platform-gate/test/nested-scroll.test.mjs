import test from "node:test";
import assert from "node:assert/strict";
import { nestedScroll, isPhoneProfile, nestedScrollDefect } from "../nested-scroll.mjs";

// Tiny fake DOM: enough for nestedScroll() (runs in-page in real use).
function el(tag, { style = {}, clientHeight = 0, scrollHeight = 0, width = 360, text = "", kids = [], cls = "", id = "", skipMatch = false } = {}) {
  const n = { tagName: tag.toUpperCase(), className: cls, id, style, clientHeight, scrollHeight, innerText: text, children: kids, parentElement: null,
    getBoundingClientRect: () => ({ width, height: clientHeight }),
    closest: () => (skipMatch ? n : null),
    contains: (o) => o === n || kids.some((k) => k.contains(o)),
    querySelector: (s) => kids.find((k) => s.split(",").includes(k.tagName.toLowerCase())) || null,
    querySelectorAll: (s) => kids.filter((k) => s.split(",").includes(k.tagName.toLowerCase())) };
  kids.forEach((k) => (k.parentElement = n));
  return n;
}
function mount(nodes, vh = 844) {
  const body = { tagName: "BODY" };
  nodes.forEach((n) => { if (!n.parentElement) n.parentElement = body; });
  const all = []; const walk = (n) => { all.push(n); n.children.forEach(walk); }; nodes.forEach(walk);
  globalThis.document = { body, documentElement: { clientWidth: 390 }, querySelectorAll: () => all };
  globalThis.innerHeight = vh;
  globalThis.getComputedStyle = (n) => ({ overflowY: "visible", maxHeight: "none", position: "static", display: "block", visibility: "visible", ...(n.style || {}) });
}
const LONG = "Hamas launches roughly 3,000 rockets from Gaza, striking multiple Israeli cities. ".repeat(6);

test("framed timeline with its own scrollbar (10-7.org before) fails", () => {
  const box = el("div", { cls: "timeline-container", style: { overflowY: "auto", maxHeight: "542px" }, clientHeight: 542, scrollHeight: 18277, text: LONG, kids: [el("article"), el("h3")] });
  mount([box]);
  const found = nestedScroll();
  assert.equal(found.length, 1);
  assert.match(found[0], /div\.timeline-container 542\/18277px/);
  assert.match(nestedScrollDefect(found), /^nested scroll: /);
});

test("page-scroll layout, short scrollers, overlays, tables and opt-outs pass", () => {
  mount([
    el("div", { cls: "timeline-container", style: { overflowY: "visible" }, clientHeight: 18000, scrollHeight: 18000, text: LONG }),
    el("div", { cls: "chips", style: { overflowY: "auto", maxHeight: "100px" }, clientHeight: 100, scrollHeight: 400, text: LONG }),
    el("div", { cls: "drawer", style: { overflowY: "auto", position: "fixed", maxHeight: "600px" }, clientHeight: 600, scrollHeight: 3000, text: LONG }),
    el("div", { cls: "narrow", style: { overflowY: "auto", maxHeight: "400px" }, clientHeight: 400, scrollHeight: 3000, width: 150, text: LONG }),
    el("div", { cls: "wrap", style: { overflowY: "auto", maxHeight: "400px" }, clientHeight: 400, scrollHeight: 3000, text: LONG, skipMatch: true }),
    el("div", { cls: "tiny-text", style: { overflowY: "auto", maxHeight: "400px" }, clientHeight: 400, scrollHeight: 3000, text: "ok" }),
  ]);
  assert.deepEqual(nestedScroll(), []);
  assert.equal(nestedScrollDefect([]), null);
});

test("only the outermost nested scroller is reported", () => {
  const inner = el("div", { cls: "inner", style: { overflowY: "auto", maxHeight: "300px" }, clientHeight: 300, scrollHeight: 2000, text: LONG, kids: [el("h2")] });
  const outer = el("div", { cls: "outer", style: { overflowY: "scroll", maxHeight: "500px" }, clientHeight: 500, scrollHeight: 4000, text: LONG, kids: [inner] });
  mount([outer]);
  assert.deepEqual(nestedScroll().length, 1);
});

test("phone profiles exclude tablets", () => {
  assert.equal(isPhoneProfile("iphone-se"), true);
  assert.equal(isPhoneProfile("iphone-se-landscape"), true);
  assert.equal(isPhoneProfile("ipad-mini"), false);
});

test("ratchet names the defect mobile:nested-scroll", async () => {
  const { checkOf } = await import("../ratchet.mjs");
  assert.deepEqual(checkOf("nested scroll: div.timeline-container 542/18277px"), { check: "mobile:nested-scroll", n: 1 });
});
