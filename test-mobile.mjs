// test-mobile.mjs -- the mobile floor, enforced.
//
// Every rule here failed at least once when first measured, at real device
// widths, on the shipped pages:
//
//   * buttons 42px, selects 36px, state chips 32px, nav links 15-17px tall --
//     all under the 44px floor. This product's primary user is a two- to
//     seven-year-old whose motor control is worse than the guideline assumes,
//     and a tap that misses reads to a child as the game ignoring them.
//   * form controls at 14-15px, which makes Safari on iOS auto-zoom the page
//     on focus and never zoom back out.
//   * 56px of horizontal overflow on the bench page at 320px, from an
//     unbroken userAgent string in a table.
//   * a 2:1 stage only 146px tall in portrait, leaving the companion too small
//     to read on the surface that matters most.
//
// Requires a static server; run: npm run test:mobile
// (skips cleanly with an explanatory message if Playwright isn't installed.)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.MOBILE_TEST_PORT || 9123);
const DEVICES = [
  { n: 'iPhone SE',      w: 320, h: 568 },
  { n: 'iPhone 12/13',   w: 390, h: 844 },
  { n: 'iPhone Pro Max', w: 430, h: 932 },
  { n: 'iPad portrait',  w: 768, h: 1024 },
];
const PAGES = [
  '/scene/index.html', '/engine/index.html', '/bench/index.html',
  '/guides/index.html', '/index.html', '/clinician/index.html', '/parent/index.html', '/words/index.html',
];
const MIN_TAP = 44, MIN_FORM_FONT = 16;

// One shared guard decides if a browser test can run at all. Checking that the
// module imports is not enough: the package installs fine on a machine whose
// system libraries are missing, and the launch is what actually fails.
import { browserOrSkip } from './test-browser.mjs';
const chromium = await browserOrSkip('test-mobile');
if (!existsSync('dist/index.html')) {
  console.log('\n(skipped: run `npm run build` first)\n');
  process.exit(0);
}

const srv = spawn('python3', ['-c', `
import http.server, socketserver, os
os.chdir("dist")
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
class T(socketserver.ThreadingTCPServer):
    allow_reuse_address=True; daemon_threads=True
T(("",${PORT}), H).serve_forever()
`], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; failures.push(`${n}${d ? ' -- ' + d : ''}`); } };

const browser = await chromium.launch({
  ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
});
for (const d of DEVICES) {
  for (const path of PAGES) {
    const page = await browser.newPage({
      viewport: { width: d.w, height: d.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    try {
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(600);
      const r = await page.evaluate((MIN) => {
        const de = document.documentElement;
        return {
          overflow: de.scrollWidth - de.clientWidth,
          // SVG descendants are clipped by the SVG viewport; a cover/slice
          // image legitimately paints outside its box, so they are not overflow.
          outside: [...document.querySelectorAll('body *')].filter((el) => {
            if (el.closest('svg')) return false;
            const b = el.getBoundingClientRect();
            return b.width > 0 && (b.right > de.clientWidth + 1 || b.left < -1);
          }).slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')),
          small: [...document.querySelectorAll('button,a,select,input,[role=button]')].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && (b.width < MIN || b.height < MIN);
          }).slice(0, 4).map((el) => (el.id || el.className || el.tagName) + ' '
            + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)),
          tinyFont: [...document.querySelectorAll('input,select,textarea')]
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
            .slice(0, 3).map((el) => (el.id || el.tagName) + ' ' + getComputedStyle(el).fontSize),
          viewport: (document.querySelector('meta[name=viewport]') || {}).content || 'MISSING',
        };
      }, MIN_TAP);

      const at = `${d.n} ${path}`;
      ok(`${at}: no horizontal overflow`, r.overflow <= 1, `${r.overflow}px`);
      ok(`${at}: nothing outside the viewport`, r.outside.length === 0, r.outside.join(','));
      ok(`${at}: every target >= ${MIN_TAP}px`, r.small.length === 0, r.small.join(' , '));
      ok(`${at}: no form font < ${MIN_FORM_FONT}px (iOS auto-zoom)`, r.tinyFont.length === 0, r.tinyFont.join(' , '));
      ok(`${at}: has a viewport meta`, r.viewport !== 'MISSING');
      // Disabling pinch-zoom fails WCAG 1.4.4 and takes a real tool away from
      // the parent reading the small print.
      ok(`${at}: pinch-zoom is not disabled`, !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(r.viewport), r.viewport);
    } catch (e) {
      ok(`${d.n} ${path}: loads`, false, e.message.split('\n')[0]);
    }
    await page.close();
  }
}
await browser.close();
srv.kill();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  x ' + f); process.exit(1); }
console.log('OK\n');
