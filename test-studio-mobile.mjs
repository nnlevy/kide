// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// 320x568 coverage for /parent/studio and /play/made in entitled, empty,
// unauthenticated, and hub-unknown states. APIs are MOCKED via route intercept.
// Layout/copy/motion are ACTUAL static pages.

import { spawn } from "node:child_process";
import { browserOrSkip } from "./test-browser.mjs";
import { COMING_SOON_MESSAGE, UNKNOWN_MESSAGE } from "./src/studio/access.js";

const PORT = Number(process.env.STUDIO_MOBILE_PORT || 9155);
const BASE = `http://127.0.0.1:${PORT}`;
const VIEW = { width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const chromium = await browserOrSkip("test-studio-mobile");
const root = "public";

const srv = spawn("python3", ["-c", `
import http.server, socketserver, os
os.chdir(${JSON.stringify(root)})
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class T(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
T(("127.0.0.1", ${PORT}), H).serve_forever()
`], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 500));
process.on("exit", () => { try { srv.kill(); } catch { /* already gone */ } });

let pass = 0, fail = 0;
const failures = [];
const ok = (n, c, d = "") => {
  if (c) { pass += 1; console.log(`  ok   ${n}`); }
  else { fail += 1; failures.push(`${n}${d ? " -- " + d : ""}`); console.log(`  FAIL ${n}${d ? " -- " + d : ""}`); }
};

const browser = await chromium.launch({
  ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function passHold(page) {
  await page.locator("#holdPrompt").waitFor({ state: "visible" });
  const prompt = await page.locator("#holdPrompt").innerText();
  const m = prompt.match(/What is (\d+) \+ (\d+)\?/);
  if (!m) throw new Error("hold prompt missing");
  await page.fill("#holdAnswer", String(Number(m[1]) + Number(m[2])));
  await page.click("#holdGo");
  await page.waitForFunction(() => {
    const gate = document.getElementById("gate");
    const studio = document.getElementById("studio");
    return (gate && !gate.hidden) || (studio && !studio.hidden);
  });
}

async function mockStudio(page, { status, playlist = { ok: true, lessons: [] }, lessons = { ok: true, lessons: [] } }) {
  await page.route("**/api/studio/status", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(status),
  }));
  await page.route("**/api/studio/playlist", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(playlist),
  }));
  await page.route("**/api/studio/lessons", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(lessons),
  }));
}

function firstScreen(sel) {
  return sel.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return b.top >= 0 && b.bottom <= window.innerHeight && b.width >= 44 && b.height >= 44;
  });
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: { ok: true, enabled: false, signedIn: false, state: "closed", checkout: "coming_soon", message: COMING_SOON_MESSAGE },
  });
  await page.goto(`${BASE}/parent/studio/`, { waitUntil: "domcontentloaded" });
  await passHold(page);
  ok("unauthenticated studio: closed copy, no pay", await page.locator("#gateBody").innerText() === COMING_SOON_MESSAGE);
  ok("unauthenticated studio: sign-in is on screen", await firstScreen(page.locator("#gate .btn")));
  ok("unauthenticated studio: form stays hidden", await page.locator("#studio").isHidden());
  const jargon = await page.locator("body").innerText();
  ok("unauthenticated studio: no checkout POST copy", !/createCheckout|price_|stripe/i.test(jargon));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: { ok: false, enabled: false, signedIn: true, state: "unknown", checkout: "coming_soon", message: UNKNOWN_MESSAGE },
  });
  await page.goto(`${BASE}/parent/studio/`, { waitUntil: "domcontentloaded" });
  await passHold(page);
  ok("hub-unknown studio: unknown copy", await page.locator("#gateBody").innerText() === UNKNOWN_MESSAGE);
  ok("hub-unknown studio: form hidden", await page.locator("#studio").isHidden());
  ok("hub-unknown studio: no pay ask", !/pay now|subscribe|checkout/i.test(await page.locator("#gate").innerText()));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: {
      ok: true, enabled: true, signedIn: true, state: "enabled", checkout: "coming_soon",
      ageBands: ["4-5"], skillGaps: [{ key: "r_initial", label: "r at the start" }],
    },
    lessons: { ok: true, lessons: [] },
  });
  await page.goto(`${BASE}/parent/studio/`, { waitUntil: "domcontentloaded" });
  await passHold(page);
  ok("entitled empty studio: form visible", await page.locator("#form").isVisible());
  ok("entitled empty studio: Propose on first 320x568 screen", await firstScreen(page.locator("#form button.primary")));
  ok("entitled empty studio: empty list copy", await page.locator("#mine").innerText() === "No lesson yet.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const anim = await page.locator("#form").evaluate((el) => getComputedStyle(el).animationName);
  ok("entitled empty studio: reduced-motion disables card rise", anim === "none");
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, { status: { ok: true, enabled: false }, playlist: { ok: true, lessons: [] } });
  await page.goto(`${BASE}/play/made/`, { waitUntil: "domcontentloaded" });
  await page.locator("#note").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("#note")?.textContent?.includes("grown-up"));
  ok("unauthenticated made: empty playlist, no pay language", /Nothing here yet|Ask a grown-up/.test(await page.locator("#note").innerText()));
  ok("unauthenticated made: no subscription jargon", !/subscription|checkout|coming soon|offering/i.test(await page.locator("body").innerText()));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: { ok: true, enabled: true, signedIn: true, state: "enabled" },
    playlist: { ok: true, lessons: [] },
  });
  await page.goto(`${BASE}/play/made/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#note")?.textContent?.includes("grown-up"));
  ok("entitled empty made: grown-up picks one", (await page.locator("#note").innerText()).includes("grown-up"));
  ok("entitled empty made: no lesson buttons", (await page.locator("#lessons a").count()) === 0);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: { ok: false, enabled: false, state: "unknown" },
    playlist: { ok: true, lessons: [] },
  });
  await page.goto(`${BASE}/play/made/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#note")?.textContent?.includes("grown-up"));
  ok("hub-unknown made: still a play empty, not a status page", !/unknown|503|subscription|checkout/i.test(await page.locator("body").innerText()));
  ok("hub-unknown made: ask a grown-up or empty", /Ask a grown-up|Nothing here yet/.test(await page.locator("#note").innerText()));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, ...VIEW });
  await mockStudio(page, {
    status: { ok: true, enabled: true, signedIn: true, state: "enabled" },
    playlist: { ok: true, lessons: [{ id: "ls_1", title: "Practice r at the start", ageBand: "4-5", skillGaps: ["r_initial"] }] },
  });
  await page.goto(`${BASE}/play/made/`, { waitUntil: "domcontentloaded" });
  await page.locator("#lessons a.play").waitFor({ state: "visible" });
  const href = await page.locator("#lessons a.play").getAttribute("href");
  ok("entitled made: play link goes to words engine", href === "/words/?made=ls_1");
  ok("entitled made: play control on first screen", await firstScreen(page.locator("#lessons a.play")));
  await page.close();
}

await browser.close();
try { srv.kill(); } catch { /* already gone */ }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  x " + f);
  process.exit(1);
}
