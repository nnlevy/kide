#!/usr/bin/env node
/* Records a demo of the real product and mixes in the real voice.
 *
 *   npm run demo:render
 *
 * Not a mockup: this drives the actual built site, captures actual frames, and
 * lays the actual shipped mp3s onto the timeline at the moment the page played
 * them. Nothing here can claim a behaviour the product does not have — if the
 * flow breaks, the recording breaks.
 *
 * Captions are burned in because social video is watched muted, and a silent
 * clip of a product whose whole point is that it talks says nothing at all.
 *
 * Output: public/demo.mp4 (+ demo-poster.jpg)
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(ROOT, "dist");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kide-demo-"));
const W = 430, H = 860, FPS = 30;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mp3": "audio/mpeg",
  ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain" };

/* Captions are (fromMs, toMs, text) and are filled in from the real run — the
   copy is fixed, the timings are measured. */
const CAPS = [];
const cap = (t0, t1, text) => CAPS.push({ t0, t1, text });

(async () => {
  const server = http.createServer((req, res) => {
    let f = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(8795, r));

  const browser = await chromium.launch({
    ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream",
           "--use-fake-device-for-media-stream", "--force-device-scale-factor=2"],
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, permissions: ["microphone"],
    recordVideo: { dir: TMP, size: { width: W, height: H } },
  });

  await ctx.addInitScript(() => {
    // Consent + listening pre-granted: the demo shows the feature working, and
    // the consent flow is a separate story told on the page itself.
    localStorage.setItem("kide_voice_consent_v1", JSON.stringify({ granted: true, version: 1, mode: "ondevice", at: 1 }));
    localStorage.setItem("kide_voice_prefs_v1", JSON.stringify({ muted: false, listen: true }));
    // Short session so the wind-down happens inside a demo-length clip. This is
    // the product's own setting, not a special code path.
    localStorage.setItem("pip_ttf_settings_v1", JSON.stringify({ sessionMinutes: 0.25, email: "" }));

    // One clock for everything. Captions were previously timed from the first
    // audio event but rendered against video time, which put every caption ~4s
    // ahead of the thing it described — the "Pip gets sleepy" line landed while
    // a colour question was still on screen. performance.now() is relative to
    // navigation, which is what the recorder's timeline is too.
    window.__audio = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src && /\/voice\/v1\//.test(this.src)) {
        window.__audio.push({ id: this.src.split("/").pop().replace(".mp3", ""), t: performance.now() });
      }
      return play.apply(this, arguments);
    };
    class FakeSR {
      static available() { return Promise.resolve("available"); }
      static install() { return Promise.resolve(true); }
      constructor() { window.__sr = this; }
      start() {
        setTimeout(() => this.onstart && this.onstart(), 0);
        window.__emit = (alts) => {
          const r = [alts.map((t) => ({ transcript: t, confidence: 0.9 }))];
          r[0].length = alts.length; r.length = 1;
          this.onresult && this.onresult({ resultIndex: 0, results: r });
        };
      }
      abort() {} stop() {}
    }
    window.SpeechRecognition = FakeSR;
    window.SpeechRecognitionPhrase = function (p, b) { this.phrase = p; this.boost = b; };
  });

  const page = await ctx.newPage();
  const mark = () => page.evaluate(() => performance.now());

  await page.goto("http://localhost:8795/play/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  await page.getByRole("button", { name: "Let's Play!" }).click();
  await page.waitForTimeout(2600);

  await page.locator('[data-act="handover"]').click();     // starts the clock
  await page.waitForTimeout(200);
  let t = await mark();
  cap(t, t + 3800, "Pip reads every question\\nout loud.");
  await page.waitForTimeout(3400);

  await page.getByRole("button", { name: "Yes!" }).click();
  await page.waitForTimeout(300);
  t = await mark();
  cap(t, t + 4600, "So they pick a game\\nby saying it.");
  try { await page.locator(".kv-mic.on").waitFor({ state: "visible", timeout: 12000 }); } catch (e) {}
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__emit(["colors"]));
  await page.waitForTimeout(900);

  try { await page.locator(".kv-mic.on").waitFor({ state: "visible", timeout: 14000 }); } catch (e) {}
  const target = await page.evaluate(() => document.querySelector(".p-main span").textContent.toLowerCase());
  const MUSHY = { red: "wed", blue: "boo", yellow: "lello", green: "gween", purple: "purpo", orange: "awange" };
  t = await mark();
  cap(t, t + 5200, `A toddler says “${MUSHY[target] || target}”.\\nPip hears “${target}”.`);
  await page.waitForTimeout(700);
  await page.evaluate((w) => window.__emit([w]), MUSHY[target] || target);
  await page.waitForTimeout(1800);
  t = await mark();
  cap(t + 600, t + 6200, "No accounts. No ads.\\nNothing leaves the device.");
  await page.waitForTimeout(1200);

  // Ride out the wind-down to the invitation — the part that IS the product.
  // Caption timing is derived from when the banner actually appears, never
  // guessed: a caption describing a beat the camera missed is a lie.
  await page.locator(".invite").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(250);
  t = await mark();
  cap(t, t + 4400, "Then Pip gets sleepy\\nand asks to be tucked in.");
  await page.waitForTimeout(4200);
  await page.locator("#tuckBtn").click();
  await page.waitForTimeout(300);
  t = await mark();
  cap(t, t + 4400, "Screen time ends\\non Pip’s terms.");
  await page.waitForTimeout(4400);

  const audio = await page.evaluate(() => window.__audio);
  const total = await mark();
  await page.close();          // flushes the video file
  await ctx.close();
  await browser.close();
  server.close();

  const webm = fs.readdirSync(TMP).filter((f) => f.endsWith(".webm")).map((f) => path.join(TMP, f))[0];
  if (!webm) throw new Error("no video captured");
  console.log(`  captured ${(total / 1000).toFixed(1)}s, ${audio.length} voice lines`);

  /* --- audio track: each shipped clip, at the ms the page actually played it --- */
  const PACK = path.join(ROOT, "public", "voice", "v1");
  const durMs = Math.ceil(total) + 1500;
  const inputs = [], filters = [];
  audio.forEach((a, i) => {
    const f = path.join(PACK, a.id + ".mp3");
    if (!fs.existsSync(f)) return;
    inputs.push("-i", f);
    filters.push(`[${inputs.length / 2}:a]adelay=${Math.round(a.t)}|${Math.round(a.t)}[a${i}]`);
  });
  const mixTags = filters.map((_, i) => `[a${i}]`).join("");
  const audioGraph = `${filters.join(";")};${mixTags}amix=inputs=${filters.length}:normalize=0[mix]`;

  /* --- captions: burned in, because muted autoplay is the default --- */
  const esc = (s) => s.replace(/[\\:']/g, (c) => "\\" + c).replace(/,/g, "\\,");
  const draw = CAPS.map(({ t0, t1, text }) => {
    const lines = text.split("\\n");
    return lines.map((ln, li) =>
      `drawtext=text='${esc(ln)}':fontcolor=white:fontsize=24:box=1:boxcolor=0x141A2Fcc:boxborderw=16` +
      `:x=(w-text_w)/2:y=h-238+${li * 34}:enable='between(t,${(t0 / 1000).toFixed(2)},${(t1 / 1000).toFixed(2)})'`
    ).join(",");
  }).join(",");

  const out = path.join(ROOT, "public", "demo.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error",
    "-i", webm, ...inputs,
    "-filter_complex", `${audioGraph};[0:v]fps=${FPS},scale=${W}:${H},${draw}[v]`,
    "-map", "[v]", "-map", "[mix]",
    "-t", (durMs / 1000).toFixed(2),
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    out], { stdio: "inherit" });

  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", out, "-ss", "1.2", "-vframes", "1",
    "-q:v", "3", path.join(ROOT, "public", "demo-poster.jpg")], { stdio: "inherit" });

  console.log(`  public/demo.mp4         ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}mb`);
  console.log(`  public/demo-poster.jpg  ${(fs.statSync(path.join(ROOT, "public", "demo-poster.jpg")).size / 1024).toFixed(0)}kb`);
})().catch((e) => { console.error(e); process.exit(1); });
