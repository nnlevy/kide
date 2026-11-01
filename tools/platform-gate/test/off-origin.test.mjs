import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameSite } from "../same-site.mjs";
// Regression: local `wrangler dev` 301'd to live www, so the gate silently audited production instead of the build.
test("gate.mjs and mobile-strict.mjs refuse pages that redirect off-origin", () => {
  for (const f of ["../gate.mjs", "../mobile-strict.mjs"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /!sameSite\(url, page\.url\(\)\)/, f);
    assert.match(src, /redirected off-origin/, f);
  }
});
test("apex -> www (and www -> apex, http -> https) of the same domain is the same site", () => {
  assert.ok(sameSite("https://machinelearninglogistics.com/", "https://www.machinelearninglogistics.com/"));
  assert.ok(sameSite("https://machinelearninglogistics.com/how-it-works", "https://www.machinelearninglogistics.com/how-it-works"));
  assert.ok(sameSite("https://www.quizbiz.org/", "https://quizbiz.org/"));
  assert.ok(sameSite("http://quizbiz.org/", "https://www.quizbiz.org/"));
  assert.ok(sameSite("http://127.0.0.1:18832/", "http://127.0.0.1:18832/pricing"));
});
test("a different domain or any other hop is still off-origin", () => {
  assert.equal(sameSite("https://machinelearninglogistics.com/", "https://quizbiz.org/"), false);
  assert.equal(sameSite("https://quizbiz.org/", "https://www.quizbiz.org.evil.com/"), false);
  assert.equal(sameSite("https://quizbiz.org/", "https://dashboard.quizbiz.org/"), false);
  assert.equal(sameSite("https://quizbiz.org/", "http://quizbiz.org/"), false);
  assert.equal(sameSite("http://127.0.0.1:19210/", "https://www.machinelearninglogistics.com/"), false);
  assert.equal(sameSite("http://localhost:8787/", "http://www.localhost:8787/"), false);
});
