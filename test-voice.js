/* End-to-end check of the voice layer against the real built site. */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

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


/* Everything the game owns lives inside an IIFE — as it should — so the test
   drives the real UI, including the grown-ups maths gate. */
async function solveGate(pg) {
  const q = await pg.locator(".gate-q").innerText();      // "What is 4 + 7?"
  const m = q.match(/(\d+)\s*\+\s*(\d+)/);
  await pg.locator(`.gate-opt`, { hasText: new RegExp("^" + (parseInt(m[1]) + parseInt(m[2])) + "$") }).click();
  await pg.waitForTimeout(250);
}
async function openParentCorner(pg) {
  // The gear only exists on the home and garden screens — leave play first.
  if (await pg.locator('[data-act="parents"]').count() === 0) {
    await pg.locator('[data-act="garden"]').first().click();
    await pg.waitForTimeout(300);
  }
  await pg.locator('[data-act="parents"]').first().click();
  await pg.waitForTimeout(200);
  await solveGate(pg);
}
async function micReady(pg, ms) {
  try { await pg.locator(".kv-mic.on").waitFor({ state: "visible", timeout: ms || 9000 }); return true; }
  catch (e) { return false; }
}
const totalCorrect = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("pip_ttf_progress_v1") || "{}").totalCorrect || 0);
async function toGarden(pg) {
  // Already-home screens have no home button; only press it if we're elsewhere.
  if (await pg.locator('[data-act="letsplay"]').count() === 0) {
    await pg.locator('[data-act="home"]').first().click(); await pg.waitForTimeout(250);
  }
  await pg.getByRole("button", { name: "Let's Play!" }).click(); await pg.waitForTimeout(200);
  await pg.locator('[data-act="handover"]').click(); await pg.waitForTimeout(400);
  await pg.getByRole("button", { name: "Yes!" }).click(); await pg.waitForTimeout(400);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } };

(async () => {
  await new Promise((r) => server.listen(8791, r));
  // PW_CHROME lets a sandbox point at a preinstalled binary; everywhere else
  // Playwright finds its own (npx playwright install chromium).
  const browser = await chromium.launch({
    ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
  });
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();

  const errors = [], audioHits = [], missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", (r) => {
    if (r.url().includes("/voice/v1/")) { audioHits.push(r.url().split("/").pop()); if (r.status() >= 400) missing.push(r.url()); }
  });

  /* A stub recogniser that reports on-device availability and emits whatever
     transcript the test hands it — exercises the real code path without
     needing a real microphone or a real speaker. */
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeSR {
      static available() { return Promise.resolve(window.__micAvail || "available"); }
      static install() { return Promise.resolve(true); }
      constructor() { this.maxAlternatives = 1; window.__sr = this; }
      start() {
        window.__srStarted = (window.__srStarted || 0) + 1;
        setTimeout(() => { this.onstart && this.onstart(); }, 0);
        window.__emit = (alts) => {
          const results = [Object.assign(alts.map((t) => ({ transcript: t, confidence: 0.9 })), { length: alts.length })];
          results.length = 1; results[0].length = alts.length;
          this.onresult && this.onresult({ resultIndex: 0, results });
        };
      }
      abort() {} stop() {}
    }
    window.SpeechRecognition = FakeSR;
    window.SpeechRecognitionPhrase = function (p, b) { this.phrase = p; this.boost = b; };
  });

  console.log("\n── flow ──");
  await page.goto((process.env.BASE || "http://localhost:8791") + "/play/", { waitUntil: "networkidle" });
  ok(await page.locator("h1", { hasText: "Grow with Pip" }).isVisible(), "home renders");

  await page.getByRole("button", { name: "Let's Play!" }).click();
  ok(await page.locator(".handoff-card h2").innerText() === "Passing it over?", "handoff card is the next screen, not the game");
  const chips = await page.locator(".chip").allInnerTexts();
  ok(chips.some((c) => /Pip speaks/.test(c) && /ON/.test(c)), "handoff states speaking is ON");
  ok(chips.some((c) => /Nothing leaves this device/.test(c)), "handoff states the privacy posture");
  ok(await page.locator('[data-act="handover"]').isVisible(), "handoff needs a deliberate tap");

  await page.locator('[data-act="handover"]').click();
  await page.waitForTimeout(400);
  ok(await page.locator(".hello-wrap h1").innerText() === "Hi! I'm Pip.", "child-facing hello is a separate screen");
  ok(await page.evaluate(() => KideVoice.isUnlocked()), "the handoff tap unlocked audio");
  await page.waitForTimeout(600);
  ok(audioHits.includes("handoff-hello.mp3"), "Pip greets the child by voice");

  await page.getByRole("button", { name: "Yes!" }).click();
  await page.waitForTimeout(500);
  ok(await page.locator("h2", { hasText: "Pip's Garden" }).isVisible(), "garden after the child's tap");

  console.log("\n── speaking every prompt ──");
  for (const [level, expect] of [["colors", /^prompt-color-/], ["counting", /^prompt-count/], ["shapes", /^prompt-shape-/]]) {
    audioHits.length = 0;
    await page.locator(`[data-level="${level}"]`).click();
    await page.waitForTimeout(900);
    const src = await page.evaluate(() => { const a = document.querySelector("audio"); return a ? a.src.split("/").pop() : ""; });
    ok(expect.test(src), `${level}: prompt is spoken (${src})`);
    ok(await page.locator(".replay").isVisible(), `${level}: replay affordance shown`);
    await page.locator('[data-act="garden"]').click();
    await page.waitForTimeout(300);
  }

  console.log("\n── answering ──");
  await page.locator('[data-level="colors"]').click();
  await page.waitForTimeout(900);
  const target = await page.evaluate(() => window.__t = document.querySelector(".p-main span").textContent.toLowerCase());
  audioHits.length = 0;
  await page.locator(`#optWrap [data-val="${target}"]`).click();
  await page.waitForTimeout(700);
  ok(audioHits.some((f) => /^affirm-\d\.mp3/.test(f)), "correct answer is praised out loud");
  await page.waitForTimeout(800);

  console.log("\n── consent gate ──");
  await openParentCorner(page);
  ok(await page.locator("h2", { hasText: "Parent Corner" }).isVisible(), "Parent Corner sits behind the grown-ups gate");
  ok(await page.locator("#muteSwitch").isVisible(), "parent can switch Pip's voice off");
  ok(await page.locator("#listenSwitch").isVisible(), "listening toggle offered where on-device speech exists");
  ok(await page.evaluate(() => !KideVoice.consent.get()), "listening is OFF before consent");
  ok(await page.evaluate(() => !KideVoice.listenEnabled()), "listening disabled without consent");

  await page.locator("#listenSwitch").click();
  await page.waitForTimeout(300);
  const consentTxt = await page.locator(".consent-card").innerText();
  ok(consentTxt.length > 0, "the toggle opens a consent screen rather than switching the mic straight on");
  ok(/nowhere/i.test(consentTxt), "consent screen states where the voice goes");
  ok(/never recorded, stored, or transmitted/i.test(consentTxt), "consent screen makes the no-storage promise");

  await page.locator('[data-act="grant-listen"]').click();
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !!KideVoice.consent.get()), "consent recorded after the parent opts in");
  ok(await page.evaluate(() => KideVoice.consent.get().mode === "ondevice"), "consent records the on-device mode");
  ok(await page.evaluate(() => KideVoice.listenEnabled()), "listening enabled after consent");

  await page.locator('[data-act="parents-back"]').click(); await page.waitForTimeout(250);
  await toGarden(page);

  console.log("\n── navigating by voice ──");
  ok(await micReady(page, 15000), "the garden itself listens — a pre-reader can pick a game");
  await page.evaluate(() => window.__emit(["counting"]));
  await page.waitForTimeout(900);
  ok(await page.locator(".p-eyebrow", { hasText: "Counting" }).count() > 0, "saying \"counting\" opens the counting game");
  await page.locator('[data-act="garden"]').click(); await page.waitForTimeout(500);
  ok(await micReady(page, 15000), "back in the garden, listening resumes");
  await page.evaluate(() => window.__emit(["cars"]));   // what a recogniser hears for "colors"
  await page.waitForTimeout(900);
  ok(await page.locator(".p-eyebrow", { hasText: "Colors" }).count() > 0, "a mangled game name still navigates");

  console.log("\n── answering by voice ──");
  ok(await micReady(page, 15000), "the mic opens, but only after Pip has finished speaking");
  ok(await page.evaluate(() => window.__srStarted > 0), "recogniser started");
  ok(await page.evaluate(() => window.__sr && window.__sr.processLocally === true), "recogniser is pinned to on-device processing");
  const spoken = await page.evaluate(() => document.querySelector(".p-main span").textContent.toLowerCase());
  const before = await totalCorrect(page);
  await page.evaluate((w) => window.__emit([w]), spoken);
  await page.waitForTimeout(800);
  ok(await totalCorrect(page) === before + 1, "a spoken answer scores exactly like a tap");

  console.log("\n── toddler pronunciation ──");
  const MUSHY = { red: "wed", blue: "boo", yellow: "hello", green: "gween", purple: "people", orange: "awange" };
  let mushyOk = 0, mushyTried = 0;
  for (let i = 0; i < 10; i++) {
    if (!(await micReady(page, 15000))) { console.log(`    (mic did not reopen after ${mushyTried} rounds)`); break; }
    const t = await page.evaluate(() => { const s = document.querySelector(".p-main span"); return s ? s.textContent.toLowerCase() : null; });
    if (!t || !MUSHY[t]) { await page.waitForTimeout(500); continue; }
    mushyTried++;
    const n0 = await totalCorrect(page);
    await page.evaluate((w) => window.__emit && window.__emit([w]), MUSHY[t]);
    await page.waitForTimeout(700);
    if (await totalCorrect(page) === n0 + 1) mushyOk++;
  }
  // Also a regression pin: ten consecutive questions in a two-to-three colour
  // round guarantees repeats, and a repeated target used to look like a
  // duplicate render — Pip silent, microphone never reopening.
  ok(mushyTried >= 8 && mushyOk === mushyTried,
    `mispronounced answers land on ${mushyTried} consecutive questions incl. repeats (${mushyOk}/${mushyTried})`);

  console.log("\n── clip missing / offline ──");
  const p3 = await ctx.newPage();
  // Simulates the real production failure mode, not a tidy 404: Cloudflare's
  // SPA not-found handling answers a missing file with 200 + the HTML shell,
  // so the audio element receives text/html and has to fail gracefully.
  await p3.route("**/voice/v1/prompt-color-*.mp3", (r) =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!DOCTYPE html><html><body>shell</body></html>" }));
  await p3.addInitScript(() => {
    window.__tts = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = function (u) {
      window.__tts.push(u.text); try { if (u.onend) setTimeout(u.onend, 30); } catch (e) {}
    };
  });
  await p3.goto((process.env.BASE || "http://localhost:8791") + "/play/", { waitUntil: "networkidle" });
  await p3.getByRole("button", { name: "Let's Play!" }).click(); await p3.waitForTimeout(250);
  await p3.locator('[data-act="handover"]').click(); await p3.waitForTimeout(500);
  await p3.getByRole("button", { name: "Yes!" }).click(); await p3.waitForTimeout(600);
  await p3.locator('[data-level="colors"]').click(); await p3.waitForTimeout(2500);
  ok((await p3.evaluate(() => window.__tts)).some((t) => /Find something/.test(t)),
     "a missing clip falls back to the browser's own voice rather than going silent");
  const tgt3 = await p3.evaluate(() => document.querySelector(".p-main span").textContent.toLowerCase());
  const n3 = await totalCorrect(p3);
  await p3.locator(`#optWrap [data-val="${tgt3}"]`).click(); await p3.waitForTimeout(600);
  ok(await totalCorrect(p3) === n3 + 1, "the game stays fully playable with no audio at all");

  console.log("\n── device with no on-device speech ──");
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await p2.goto((process.env.BASE || "http://localhost:8791") + "/play/", { waitUntil: "networkidle" });
  await p2.getByRole("button", { name: "Let's Play!" }).click();
  await p2.waitForTimeout(600);
  const chips2 = await p2.locator(".chip").allInnerTexts();
  ok(chips2.some((c) => /NOT ON THIS DEVICE/.test(c)), "handoff card says listening isn't available here");
  ok(chips2.some((c) => /Pip speaks/.test(c) && /ON/.test(c)), "speaking still works with no mic at all");
  ok(await p2.evaluate(() => !KideVoice.listenEnabled()), "a consent stored from another device state does not enable the mic here");
  ok(await p2.evaluate(() => KideVoice.mic.listen({ vocab: [{ key: "red", value: "red" }] }) === false), "the module itself refuses to open a mic here, even if asked directly");
  await p2.locator('[data-act="parents"]').click(); await p2.waitForTimeout(200);
  await solveGate(p2);
  const set2 = await p2.locator(".settings-card").filter({ has: p2.locator("h3", { hasText: "Pip's listening" }) }).innerText();
  ok(/without sending your child/i.test(set2), "Parent Corner explains the refusal honestly");
  ok(await p2.locator("#listenSwitch").count() === 0, "no way to switch on a cloud mic at all");

  console.log("\n── handoff record ──");
  // The goodbye ritual's counter lives in the same session hooks the voice
  // layer's resume-on-return touches. Backgrounding the tab must not log a
  // second handoff, or the Parent Corner over-reports every screen lock.
  const handoffs = (pg) => pg.evaluate(() => (JSON.parse(localStorage.getItem("pip_ttf_progress_v1") || "{}").handoffs || []).length);
  const h0 = await handoffs(page);
  ok(h0 > 0, `handing the device over is recorded (${h0} so far)`);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  ok(await handoffs(page) === h0, "backgrounding and returning does not log a phantom handoff");

  console.log("\n── share moment ──");
  // The share only exists once there is something true to say, and it lives
  // behind the grown-ups gate — never on the child-facing goodbye screen.
  await openParentCorner(page);
  ok(await page.locator("#shareWeek").count() === 0, "no share offered before the habit has any evidence behind it");
  await page.locator('[data-act="home"]').first().click(); await page.waitForTimeout(200);
  for (let i = 0; i < 2; i++) {                       // two real goodbyes
    await toGarden(page);
    await page.locator('[data-level="shapes"]').click(); await page.waitForTimeout(500);
    await page.locator('[data-act="sleepytap"]').click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "See you soon!" }).click(); await page.waitForTimeout(300);
  }
  await openParentCorner(page);
  ok(await page.locator("#shareWeek").isVisible(), "share appears once two sessions have ended with a goodbye");
  ok(await page.locator(".home-actions #shareWeek").count() === 0, "share is in Parent Corner, not on the child's goodbye screen");
  const shareText = await page.evaluate(() => {
    let captured = null;
    navigator.share = (d) => { captured = d; return Promise.resolve(); };
    document.getElementById("shareWeek").click();
    return captured;
  });
  ok(!!shareText && /ended with my kid saying goodnight/.test(shareText.text), "share text leads with the parent's own result");
  ok(!!shareText && shareText.url === "https://kide.us", "share carries the link");

  console.log("\n── pronunciation matcher ──");
  const CASES = [
    [["wed"], ["red","blue"], "red"], [["bread"], ["red","blue"], "red"],
    [["boo"], ["blue","yellow"], "blue"], [["blew"], ["blue","green"], "blue"],
    [["hello"], ["yellow","red"], "yellow"], [["lello"], ["yellow","green"], "yellow"],
    [["gween"], ["green","red"], "green"], [["queen"], ["green","purple"], "green"],
    [["people"], ["purple","orange"], "purple"], [["awange"], ["orange","blue"], "orange"],
    [["circo"], ["circle","square"], "circle"], [["round"], ["circle","triangle"], "circle"],
    [["scare"], ["square","circle"], "square"], [["tryangle"], ["triangle","square"], "triangle"],
    [["free"], ["3","1"], "3"], [["tree"], ["3","2"], "3"], [["for"], ["4","2"], "4"],
    [["fife"], ["5","3"], "5"], [["um two"], ["2","4"], "2"],
    [["i think its red"], ["red","blue"], "red"],
    [["nope","red"], ["red","blue"], "red"],
    [["reds"], ["red","blue"], "red"], [["greeny"], ["green","red"], "green"],
    [["circley"], ["circle","square"], "circle"],
    // and things that must NOT resolve to an answer
    [["banana"], ["red","blue"], null], [[""], ["red","blue"], null],
    [["hello"], ["red","blue"], null],      // only maps to yellow when yellow is offered
    [["people"], ["red","blue"], null],
    [["dog"], ["circle","square"], null],
    [["seven"], ["3","2"], null],
    [["tomato"], ["2","4"], null],          // "to" is an alias for 2 — must not over-reach
    [["reddish"], ["red","blue"], null],    // too far from "red"; a miss beats a wrong guess
    [["red"], ["red","orange"], "red"]      // and the plain case still wins outright
  ];
  const mres = await page.evaluate((cases) => cases.map(([alts, opts, want]) => {
    const v = opts.map((o) => ({ key: o, value: o }));
    const got = KideVoice._match(alts, v);
    return { alts, opts, want, got: got ? got.value : null };
  }), CASES);
  const bad = mres.filter((r) => r.got !== r.want);
  bad.forEach((r) => console.log(`    · "${r.alts}" with [${r.opts}] → ${r.got} (wanted ${r.want})`));
  ok(bad.length === 0, `${CASES.length} pronunciation cases, ${CASES.length - bad.length} correct`);

  console.log("\n── assets ──");
  ok(missing.length === 0, "every requested clip resolved" + (missing.length ? " — missing " + missing.join(",") : ""));
  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
