import { test } from "node:test"; import assert from "node:assert/strict";
import { execFileSync } from "node:child_process"; import { readFileSync, existsSync } from "node:fs";
import { needsLive, liveEntry, checkOf, pageFailures, buildBaseline, shrinkViolations, evaluate, changedPages, intersect, BASELINE_FILE, siteTotal } from "../ratchet.mjs";

const U = "https://a.com";
const gate = (failing = [], claims = []) => ({ urls: [U + "/", U + "/x", U + "/y"], mobile: { pass: 0, total: 1, failing }, claims });
const mf = (path, ...defects) => ({ device: "android-320", url: U + path, defects });
const entry = { remove_by: "2026-11-30", profiles: "15", total: 3, pages: { "/x": { "mobile:taps<44": 2, "mobile:overflow": 1 } } };

test("checkOf groups defects by check", () => {
  assert.deepEqual(checkOf('2 taps<44: input#a "" 10x10'), { check: "mobile:taps<44", n: 2 });
  assert.deepEqual(checkOf("6 text<12px: b"), { check: "mobile:text<12px", n: 6 });
  assert.deepEqual(checkOf("axe critical: label(1), select-name(1)"), { check: "mobile:axe-critical", n: 2 });
  assert.equal(checkOf("overflow 40px").check, "mobile:overflow");
  assert.equal(checkOf("journey: x").check, "mobile:journey");
});

test("unchanged baselined failures pass", () => {
  const r = evaluate({ gate: gate([mf("/x", "2 taps<44: a", "overflow 9px")]), entry, today: "2026-10-22" });
  assert.deepEqual(r.block, []); assert.equal(r.shrunk, null);
});

test("a new failure on a baselined page, a worse count, and a regressed passing page all block", () => {
  assert.match(evaluate({ gate: gate([mf("/x", "2 taps<44: a", "overflow 9px", "3 text<12px: b")]), entry, today: "2026-10-22" }).block[0], /^NEW_FAILURE \/x mobile:text<12px/);
  assert.match(evaluate({ gate: gate([mf("/x", "5 taps<44: a")]), entry, today: "2026-10-22" }).block[0], /^WORSE \/x mobile:taps<44 2->5/);
  assert.match(evaluate({ gate: gate([mf("/y", "1 taps<44: a")]), entry, today: "2026-10-22" }).block[0], /^REGRESSION \/y/);
});

test("home page and keyurls pages are strict even if a baseline lists them", () => {
  const e = { ...entry, pages: { ...entry.pages, "/": { "mobile:taps<44": 9 }, "/k": { "mobile:taps<44": 9 } } };
  const r = evaluate({ gate: { ...gate([mf("/", "1 taps<44: a"), mf("/k", "1 taps<44: a")]), urls: [U + "/", U + "/k"] }, entry: e, strictPaths: ["/k"], today: "2026-10-22" });
  assert.equal(r.block.filter((b) => b.startsWith("STRICT")).length, 2);
});

test("js errors always block; expired baselines stop counting", () => {
  assert.match(evaluate({ gate: gate([], [{ kind: "js_error", page: U + "/x", match: "TypeError: q" }]), entry, today: "2026-10-22" }).block[0], /^JS_ERROR \/x/);
  const r = evaluate({ gate: gate([mf("/x", "2 taps<44: a")]), entry, today: "2026-12-01" });
  assert.ok(r.block.length && r.info[0].includes("expired"));
});

test("fixed failures shrink the entry", () => {
  const r = evaluate({ gate: gate([mf("/x", "1 taps<44: a")]), entry, today: "2026-10-22" });
  assert.deepEqual(r.block, []); assert.deepEqual(r.shrunk.pages, { "/x": { "mobile:taps<44": 1 } }); assert.equal(r.shrunk.total, 1);
  assert.equal(evaluate({ gate: gate([]), entry, today: "2026-10-22" }).shrunk.total, 0);
  assert.deepEqual(shrinkViolations({ sites: { "a.com": entry } }, { sites: { "a.com": r.shrunk } }), []);
});

test("editing a baselined page without fixing it blocks; fixing it passes", () => {
  const diff = "diff --git a/public/x.html b/public/x.html\n--- a/public/x.html\n+++ b/public/x.html\n@@ -1 +1 @@\n-<p>a</p>\n+<p>b</p>\n";
  const ch = changedPages(diff, ["/x", "/y"]); assert.deepEqual(ch, ["/x"]);
  assert.match(evaluate({ gate: gate([mf("/x", "2 taps<44: a", "overflow 1px")]), entry, changed: ch, today: "2026-10-22" }).block[0], /^CHANGED_NOT_FIXED \/x/);
  assert.deepEqual(evaluate({ gate: gate([]), entry, changed: ch, today: "2026-10-22" }).block, []);
  assert.deepEqual(changedPages("diff --git a/src/worker.js b/src/worker.js\n+  if (path === '/x') return x();\n", ["/x", "/y"]), ["/x"]);
  assert.deepEqual(changedPages("diff --git a/src/worker.js b/src/worker.js\n+  const z = 1;\n", ["/x"]), []);
});

test("shrinkViolations rejects added and widened entries", () => {
  const o = { sites: { "a.com": entry } };
  const w = (pages, extra = {}) => ({ sites: { "a.com": { ...entry, ...extra, pages, total: siteTotal({ pages }) } } });
  assert.match(shrinkViolations(o, w({ "/x": { "mobile:taps<44": 3, "mobile:overflow": 1 } }))[0], /widened/);
  assert.match(shrinkViolations(o, w({ ...entry.pages, "/z": { "mobile:cls": 1 } }))[0], /added page/);
  assert.match(shrinkViolations(o, w({ "/x": { ...entry.pages["/x"], "mobile:cls": 1 } }))[0], /added check/);
  assert.match(shrinkViolations(o, w(entry.pages, { remove_by: "2027-01-01" }))[0], /later/);
  assert.match(shrinkViolations(o, { sites: { ...o.sites, "b.com": entry } })[0], /added site/);
  assert.deepEqual(intersect(entry, { pages: { "/x": { "mobile:taps<44": 1 } } }).pages, { "/x": { "mobile:taps<44": 1 } });
});

test("buildBaseline skips strict pages and dates worst sites first", () => {
  const b = buildBaseline([{ site: "small.com", pages: { "/a": { "mobile:cls": 1 } } }, { site: "big.com", pages: { "/": { "mobile:cls": 1 }, "/k": { "mobile:cls": 1 }, "/b": { "mobile:taps<44": 9 } } }], { strictPaths: { "big.com": ["/k"] } });
  assert.deepEqual(Object.keys(b.sites["big.com"].pages), ["/b"]); assert.ok(b.sites["big.com"].remove_by < b.sites["small.com"].remove_by);
});

test("committed baseline only shrinks vs origin/main (CI)", (t) => {
  if (!existsSync(BASELINE_FILE)) return t.skip("no baseline yet");
  const cur = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  assert.deepEqual(shrinkViolations(cur, cur), []);
  for (const s of Object.values(cur.sites)) for (const p of Object.keys(s.pages)) assert.notEqual(p, "/", "home page is never baselined");
  let prev; const rel = "tools/platform-gate/baseline/subpages.json";
  try { try { execFileSync("git", ["fetch", "-q", "--depth=1", "origin", "main"], { stdio: "ignore" }); } catch {}
    prev = JSON.parse(execFileSync("git", ["show", `origin/main:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 })); } catch { return t.skip("baseline not on origin/main yet (first commit)"); }
  assert.deepEqual(shrinkViolations(prev, cur), [], "baseline may only shrink");
});

test("first deploy without a 15-profile record compares build with live and records the result", () => {
  const seeded = { remove_by: "2026-11-30", profiles: "android-320", total: 1, pages: { "/x": { "mobile:taps<44": 1 } } };
  assert.equal(needsLive(seeded), true); assert.equal(needsLive(null), true); assert.equal(needsLive(entry), false);
  const live = gate([mf("/x", "4 taps<44: a"), mf("/", "1 taps<44: a")]);
  const ok = evaluate({ gate: gate([mf("/x", "3 taps<44: a")]), entry: seeded, liveGate: live, today: "2026-10-22" });
  assert.deepEqual(ok.block, []); assert.equal(ok.shrunk.profiles, "15"); assert.deepEqual(ok.shrunk.pages, { "/x": { "mobile:taps<44": 3 } }); assert.equal(ok.shrunk.remove_by, "2026-11-30");
  assert.match(evaluate({ gate: gate([mf("/x", "5 taps<44: a")]), entry: seeded, liveGate: live, today: "2026-10-22" }).block[0], /^WORSE/);
  assert.match(evaluate({ gate: gate([mf("/y", "1 text<12px: a")]), entry: null, liveGate: live, today: "2026-10-22" }).block[0], /^REGRESSION \/y/);
  assert.equal(liveEntry(live, seeded).pages["/"], undefined, "home never recorded");
  assert.deepEqual(intersect(seeded, ok.shrunk).pages, ok.shrunk.pages, "15-profile overlay replaces the android-320 seed");
  assert.deepEqual(intersect(ok.shrunk, { ...ok.shrunk, pages: { "/x": { "mobile:taps<44": 2 } } }).pages, { "/x": { "mobile:taps<44": 2 } });
});
