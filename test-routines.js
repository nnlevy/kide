/* End-to-end check of Pip's Turn — the pretend-play routine screens.
   The assertions here are as much about what must NOT be present (scores,
   streaks, fail states) as about what must: see docs/HABITS.md. */

const http = require("http");
const fs = require("fs");
const path = require("path");

// A browser test that cannot launch a browser is a SKIP, never a pass and never
// a crash. It used to throw, which took down `npm test` entirely -- so the suite
// could not be run end to end and a green single file was mistaken for a green
// suite. The skip is loud on purpose: silent skips are how coverage evaporates.


const ROOT = path.join(__dirname, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mp3": "audio/mpeg", ".json": "application/json", ".png": "image/png", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end("nope"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } };

async function toGarden(pg) {
  await pg.getByRole("button", { name: "Let's Play!" }).click(); await pg.waitForTimeout(150);
  await pg.locator('[data-act="handover"]').click(); await pg.waitForTimeout(350);
  await pg.getByRole("button", { name: "Yes!" }).click(); await pg.waitForTimeout(350);
}
/* Tap the scene until the routine reaches its closing screen. Returns every
   line Pip said, in order. */
async function playThrough(pg, cap) {
  const said = [];
  for (let i = 0; i < (cap || 40); i++) {
    const line = await pg.locator(".r-say").innerText();
    if (said[said.length - 1] !== line) said.push(line);
    if (await pg.locator('[data-act="routine-again"]').count() > 0) break;
    await pg.locator("#scene").click();
    await pg.waitForTimeout(120);
  }
  return said;
}

(async () => {
  await new Promise((r) => server.listen(8792, r));
  // One shared guard decides if a browser test can run at all. See test-browser.mjs.
  const { browserOrSkip } = await import('./test-browser.mjs');
  const chromium = await browserOrSkip('test-routines');
  const browser = await chromium.launch({
    ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = [], missing = [], clips = new Set();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", (r) => {
    if (r.url().includes("/voice/v1/")) { clips.add(r.url().split("/").pop()); if (r.status() >= 400) missing.push(r.url()); }
  });

  await page.goto("http://localhost:8792/play/");
  await toGarden(page);

  console.log("\n── the garden ──");
  ok(await page.locator('[data-act="playroutine"]').count() === 2, "two routines offered alongside the three quiz games");
  ok(/pip.s turn/i.test(await page.locator(".garden-sub").innerText()), "they sit under their own heading, not mixed in with the games");
  ok(await page.locator('.routine-card .leaf-dot').count() === 0, "routine cards carry no mastery dots — nothing here is scored");

  console.log("\n── the potty routine, first run ──");
  await page.locator('[data-act="playroutine"][data-routine="potty"]').click();
  await page.waitForTimeout(300);
  ok(await page.locator("#scene").count() === 1, "the scene renders");
  ok(await page.locator(".hud-leaf").count() === 0, "no leaf/progress HUD on a routine screen");
  const first = await playThrough(page);
  ok(/wiggly/i.test(first[0]), "opens with Pip's body telling Pip something, not an instruction");
  ok(first.some((l) => /did it! Right in the potty/i.test(l)), "the very first run is the whole successful sequence");
  ok(first.some((l) => /wash our hands/i.test(l)), "handwashing is part of the potty routine, not an afterthought");
  ok(/Thank you for helping me/i.test(first[first.length - 1]), "Pip thanks the child — the child was the helper, not the trainee");
  ok(first.length >= 12 && first.length <= 16, `a run is ${first.length} steps — long enough to be a routine, short enough for a toddler`);

  console.log("\n── nothing happened, and that is fine ──");
  await page.locator('[data-act="routine-again"]').click(); await page.waitForTimeout(250);
  const second = await playThrough(page);
  ok(second.some((l) => /Nothing this time. That's okay/i.test(l)), "sitting and producing nothing is an ordinary outcome");
  ok(second.some((l) => /try again later/i.test(l)), "and it is never framed as a failure");
  ok(/Thank you for helping me/i.test(second[second.length - 1]), "it ends on exactly the same warm note as a success");

  console.log("\n── accidents ──");
  let acc = null;
  for (let n = 0; n < 8 && !acc; n++) {
    await page.locator('[data-act="routine-again"]').click(); await page.waitForTimeout(250);
    const run = await playThrough(page);
    if (run.some((l) => /didn't make it/i.test(l))) acc = run;
  }
  ok(!!acc, "Pip has an accident within the first several plays");
  if (acc) {
    ok(acc.some((l) => /Accidents happen/i.test(l)), "and is told accidents happen");
    ok(!acc.some((l) => /sorry|bad|naughty|oh no|uh oh/i.test(l)), "nobody apologises, scolds, or panics");
    ok(acc.some((l) => /dry clothes/i.test(l)), "the routine continues into getting changed");
  }

  console.log("\n── nothing is scored ──");
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("pip_ttf_progress_v1") || "{}"));
  ok(p.totalCorrect === 0, "playing routines never touches the quiz's correct-answer count");
  ok(p.colors.best === 1 && p.shapes.best === 1, "and never advances a mastery tier");
  ok(typeof p.routineRuns === "number" && p.routineRuns > 0, `runs are counted for the parent only (${p.routineRuns})`);
  const body = await page.locator("body").innerText();
  ok(!/streak|star|point|score|level up|badge/i.test(body), "no scoring vocabulary appears anywhere on a routine screen");

  console.log("\n── handwashing on its own ──");
  await page.locator('[data-act="garden"]').first().click(); await page.waitForTimeout(250);
  await page.locator('[data-act="playroutine"][data-routine="handwash"]').click(); await page.waitForTimeout(300);
  const wash = await playThrough(page);
  ok(/mucky/i.test(wash[0]), "the standalone handwashing routine has its own opening");
  ok(wash.some((l) => /Scrub/i.test(l)), "and includes the scrubbing beat");
  ok(wash.length >= 6 && wash.length <= 9, `it is short — ${wash.length} steps`);

  console.log("\n── the scrub beat needs more than one tap ──");
  await page.locator('[data-act="routine-again"]').click(); await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) { await page.locator("#scene").click(); await page.waitForTimeout(110); }
  const atScrub = await page.locator(".r-say").innerText();
  ok(/Scrub/i.test(atScrub), "we are on the scrub step");
  await page.locator("#scene").click(); await page.waitForTimeout(110);
  ok(/Scrub/i.test(await page.locator(".r-say").innerText()), "one tap does not finish it");
  await page.locator("#scene").click(); await page.waitForTimeout(110);
  await page.locator("#scene").click(); await page.waitForTimeout(150);
  ok(!/Scrub/i.test(await page.locator(".r-say").innerText()), "three taps does");

  console.log("\n── leaving and coming back ──");
  await page.locator('[data-act="garden"]').first().click(); await page.waitForTimeout(250);
  ok(await page.locator('[data-act="playroutine"]').count() === 2, "backing out of a routine returns to the garden cleanly");

  console.log("\n── assets ──");
  const routineClips = [...clips].filter((c) => c.startsWith("r-"));
  ok(missing.length === 0, `every clip requested resolved (${routineClips.length} routine clips heard)`);
  ok(routineClips.length >= 12, "Pip speaks his way through the routines rather than going silent");
  ok(errors.length === 0, errors.length ? "page errors: " + errors.join(" | ") : "no page errors");

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
