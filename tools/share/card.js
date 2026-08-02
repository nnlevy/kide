#!/usr/bin/env node
/* Renders kide.us's share assets from the real product CSS.
 *
 *   node tools/share/card.js
 *
 * Pip is not redrawn here. The :root variables and every .pip-* rule are read
 * out of index.html at render time, so a card can never quietly drift from the
 * mascot it is meant to show — restyle Pip and re-run, and the card follows.
 *
 * Outputs into public/:  og-card.png (1200x630), favicon.ico, apple-touch-icon.png
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "public");

// Read Pip from the GAME, not the landing page. The game is where Pip is
// defined in full — including the .pip.sleepy state — and the landing page
// carries a reduced copy. Taking the reduced one is how you end up shipping a
// wide-awake mascot on a card about falling asleep.
const game = fs.readFileSync(path.join(ROOT, "public", "play", "index.html"), "utf8");
// The game's ENTIRE stylesheet, verbatim. Extracting "just the .pip rules"
// looks tidier and is a trap: rules like `.pip-eye.l{...}.pip-eye.r{...}` share
// a line, so a per-rule regex silently keeps the first and drops the second —
// which is how you render a mascot with both eyes on the left of its face.
// Take everything and override layout below; later rules win.
const gameCss = game.match(/<style>([\s\S]*?)<\/style>/)[1];

// Exactly what pipHTML({sleepy:true}) builds in the game.
const MOUTH_HAPPY = '<svg viewBox="0 0 40 20" width="100%" height="100%"><path d="M4,4 Q20,20 36,4" stroke="#2E3A3F" stroke-width="4" fill="none" stroke-linecap="round"/></svg>';
const MOUTH_SLEEPY = '<svg viewBox="0 0 40 20" width="100%" height="100%"><ellipse cx="20" cy="8" rx="7" ry="6" fill="#2E3A3F"/></svg>';
function pipHTML(o) {
  o = o || {};
  const leaves = o.leaves || 2;
  let leaf = '<div class="pip-leaf n1"></div>';
  if (leaves >= 2) leaf += '<div class="pip-leaf n2"></div>';
  if (leaves >= 3) leaf += '<div class="pip-leaf n3"></div>';
  return '<div class="pip-wrap"><div class="pip' + (o.sleepy ? " sleepy" : "") + '">' +
    '<div class="pip-shadow"></div><div class="pip-bob">' +
      '<div class="pip-sprout"><div class="pip-stem"></div>' + leaf + '</div>' +
      '<div class="pip-body">' +
        '<div class="pip-cheek l"></div><div class="pip-cheek r"></div>' +
        '<div class="pip-eye l"><div class="pip-pupil"></div></div>' +
        '<div class="pip-eye r"><div class="pip-pupil"></div></div>' +
        '<div class="pip-mouth">' + (o.sleepy ? MOUTH_SLEEPY : MOUTH_HAPPY) + '</div>' +
      '</div>' +
      (o.sleepy ? '<span class="zzz">Z</span><span class="zzz z2">z</span>' : '') +
    '</div></div></div>';
}
const sleepyPip = pipHTML({ sleepy: true, leaves: 3 });
const pip = pipHTML({ leaves: 2 });

const FONT = `-apple-system,BlinkMacSystemFont,"SF Pro Rounded","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif`;

function page(w, h, body, extra = "") {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${gameCss}
/* --- card overrides: everything below wins over the game's page chrome --- */
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;min-height:0;background:none}
body{font-family:${FONT};-webkit-font-smoothing:antialiased;display:block;padding:0}
/* Animations would make the render non-deterministic. */
*,*::before,*::after{animation:none!important;transition:none!important}
/* .zzz sit at opacity:0 and are revealed by the floatz keyframes, so a still
   frame with animations disabled would drop them entirely. */
.pip.sleepy .zzz{opacity:.9!important}
${extra}
</style></head><body>${body}</body></html>`;
}

/* ---------------------------------------------------------------- OG card */
const OG = page(1200, 630, `
<div class="card">
  <div class="stars"></div>
  <div class="left">
    <div class="mark">kide</div>
    <h1>The screen time<br>that ends without<br>a meltdown.</h1>
    <p>Pip gets sleepy and asks to be tucked in — so ending
       is Pip's idea, not yours. Reads every question aloud,
       for children too little to read.</p>
    <div class="url">kide.us</div>
  </div>
  <div class="right"><div class="pipbox">${sleepyPip}</div></div>
</div>`, `
.card{width:1200px;height:630px;display:flex;align-items:center;position:relative;
  background:linear-gradient(150deg,#232B4D 0%,#3A3E72 55%,#4A4E86 100%);overflow:hidden}
.card::after{content:"";position:absolute;inset:0;
  background:radial-gradient(900px 420px at 78% 52%, rgba(111,208,140,.22), transparent 68%)}
.stars{position:absolute;inset:0;opacity:.5;
  background-image:radial-gradient(1.6px 1.6px at 12% 18%, #fff, transparent),
   radial-gradient(1.4px 1.4px at 26% 62%, #fff, transparent),
   radial-gradient(1.8px 1.8px at 41% 12%, #fff, transparent),
   radial-gradient(1.2px 1.2px at 58% 78%, #fff, transparent),
   radial-gradient(1.7px 1.7px at 69% 22%, #fff, transparent),
   radial-gradient(1.3px 1.3px at 88% 68%, #fff, transparent),
   radial-gradient(1.5px 1.5px at 94% 30%, #fff, transparent),
   radial-gradient(1.2px 1.2px at 34% 88%, #fff, transparent)}
.left{position:relative;z-index:2;padding:0 0 0 76px;width:660px;text-align:left}
.left *{text-align:left}
.right{position:relative;z-index:2;flex:1;display:flex;align-items:center;justify-content:center}
.mark{font-size:30px;font-weight:800;color:#6FD08C;letter-spacing:-.02em;margin-bottom:26px}
h1{font-size:60px;line-height:1.08;font-weight:800;color:#fff;letter-spacing:-.025em}
p{margin-top:24px;font-size:22px;line-height:1.5;color:#C9D2F0;max-width:560px}
.url{margin-top:34px;font-size:20px;font-weight:800;color:#FF8A73;letter-spacing:.01em}
.pipbox{width:330px;height:330px;position:relative}
.pipbox .pip-wrap{width:100%;height:100%}
.pipbox .zzz{font-size:38px!important}
.pipbox .zzz.z2{font-size:27px!important}
`);

/* ------------------------------------------------------------------ icon */
const ICON = page(512, 512, `<div class="i"><div class="pipbox">${pip}</div></div>`, `
.i{width:512px;height:512px;display:flex;align-items:center;justify-content:center;
   background:linear-gradient(160deg,#56C6E6,#BDEBFF)}
.pipbox{width:430px;height:430px;margin-top:26px}
.pipbox .pip-wrap{width:100%;height:100%}
`);

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
  });
  // Render at 2x and let sharp downscale — text edges are noticeably cleaner
  // than asking the rasteriser for the final size directly.
  const shot = async (html, w, h, file) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: "load" });
    await p.waitForTimeout(200);
    const buf = await p.screenshot({ type: "png" });
    await p.close();
    fs.writeFileSync(file, buf);
    return buf.length;
  };

  const tmp = path.join(require("os").tmpdir(), "kide-share");
  fs.mkdirSync(tmp, { recursive: true });
  await shot(OG, 1200, 630, path.join(tmp, "og@2x.png"));
  await shot(ICON, 512, 512, path.join(tmp, "icon@2x.png"));
  await browser.close();

  const sharp = require("sharp");
  await sharp(path.join(tmp, "og@2x.png")).resize(1200, 630, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: false }).toFile(path.join(OUT, "og-card.png"));
  await sharp(path.join(tmp, "icon@2x.png")).resize(180, 180, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 }).toFile(path.join(OUT, "apple-touch-icon.png"));

  // favicon.ico: browsers request /favicon.ico by default whether or not the
  // page declares one, so a real file here is the difference between a tab
  // icon and a 404 on every single page view.
  const pngToIco = require("png-to-ico").default || require("png-to-ico");
  const sizes = await Promise.all([16, 32, 48].map((s) =>
    sharp(path.join(tmp, "icon@2x.png")).resize(s, s, { kernel: "lanczos3" }).png().toBuffer()));
  fs.writeFileSync(path.join(OUT, "favicon.ico"), await pngToIco(sizes));

  for (const f of ["og-card.png", "apple-touch-icon.png", "favicon.ico"]) {
    console.log(`  ${f.padEnd(22)} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)}kb`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
