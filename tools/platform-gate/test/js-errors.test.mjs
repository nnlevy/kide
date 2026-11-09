import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyPageError, jsErrorFindings, stackUrls } from "../js-errors.mjs";
const P = "https://a.com/x";
test("first-party uncaught errors and SyntaxErrors fail", () => {
  const r = jsErrorFindings([
    { name: "TypeError", message: "x is undefined", stack: "TypeError: x is undefined\n    at f (https://www.a.com/app.js:1:2)" },
    { name: "SyntaxError", message: "Unexpected token '<'", stack: "SyntaxError: Unexpected token '<'" },
  ], P, "a.com");
  assert.equal(r.findings.length, 2); assert.equal(r.ignored.length, 0);
  assert.match(r.findings[1].defects[0], /js_error: uncaught SyntaxError: Unexpected token/);
});
test("AdSense, Cloudflare beacon and other third-party script errors are ignored and reported", () => {
  const r = jsErrorFindings([
    { name: "Error", message: "adsbygoogle.push() error: No slot size", stack: "Error\n    at https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=1:1:9" },
    { name: "TypeError", message: "b", stack: "TypeError: b\n    at https://static.cloudflareinsights.com/beacon.min.js/v84:1:1" },
    { name: "Error", message: "c", stack: "Error: c\n    at https://a.com/cdn-cgi/challenge-platform/h/b/scripts/x.js:1:1" },
    { name: "Error", message: "w", stack: "Error: w\n    at https://widget.example.net/w.js:3:4" },
  ], P, "a.com");
  assert.equal(r.findings.length, 0); assert.equal(r.ignored.length, 4);
  assert.equal(r.ignored[0].known, true); assert.equal(r.ignored[1].known, true); assert.equal(r.ignored[3].known, false);
});
test("AdSense TagError without a stack is third-party (seen live on earn.wiki)", () => {
  const r = jsErrorFindings([{ name: "TagError", message: "Y", stack: "" }], P, "a.com");
  assert.equal(r.findings.length, 0); assert.equal(r.ignored[0].source, "adsense:TagError");
  assert.equal(jsErrorFindings([{ name: "TagError", message: "Y", stack: "at https://a.com/ads.js:1:1" }], P, "a.com").findings.length, 1);
});
test("an error that passes through first-party code still fails; duplicates collapse", () => {
  const e = { name: "Error", message: "m", stack: "Error: m\n at https://pagead2.googlesyndication.com/a.js:1:1\n at https://a.com/main.js:2:2" };
  const r = jsErrorFindings([e, e], P, "a.com"); assert.equal(r.findings.length, 1);
  assert.equal(classifyPageError(e, P, "a.com").source, "https://a.com/main.js");
  assert.deepEqual(stackUrls("at https://a.com/x.js?v=1:10:3)"), ["https://a.com/x.js?v=1"]);
});
test("gate.mjs listens for pageerror before navigation and records ignored errors", () => {
  const src = readFileSync(new URL("../gate.mjs", import.meta.url), "utf8");
  assert.ok(src.indexOf('page.on("pageerror"') > 0 && src.indexOf('page.on("pageerror"') < src.indexOf("page.goto(url"));
  assert.match(src, /jsErrorsIgnored/);
});
