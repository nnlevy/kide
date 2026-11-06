// /play must survive the mobile profiles the platform gate uses.
//
// The page used to die on load in headless Chromium: refreshMicStatus() calls
// the native SpeechRecognition.available({ processLocally: true }), and that
// build aborts the renderer instead of answering. Device emulation rewrites
// the UA to a phone string, so a desktop-only check never saw it. System
// Chrome is a different build and answers the call, which hides the bug, so
// this file launches Playwright's own Chromium and ignores PW_CHROME.
//
// A missing browser is a skip (exit 0), matching test-browser.mjs. A crash,
// or a screen that never reaches "Grow with Pip!", is a failure.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const PORT = Number(process.env.PLAY_MOBILE_PORT || 9137);
const BASE = `http://127.0.0.1:${PORT}`;

let chromiumMod;
try {
  const probe = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  await probe.close();
  chromiumMod = chromium;
} catch (e) {
  console.log('\n(SKIPPED test-play-mobile: Playwright Chromium will not launch)');
  console.log('  ' + String(e.message || e).split('\n')[0]);
  console.log('  npx playwright install chromium\n');
  process.exit(0);
}

const srv = spawn('python3', ['-c', `
import http.server, socketserver, os
os.chdir("public")
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class T(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
T(("127.0.0.1", ${PORT}), H).serve_forever()
`], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 400));

const failures = [];
function fail(msg) { failures.push(msg); console.log('  FAIL ' + msg); }
function ok(msg) { console.log('  ok   ' + msg); }

/** 200% text without touching documentElement before it exists. */
async function withLargeText(context) {
  await context.addInitScript(() => {
    const bump = () => {
      const root = document.documentElement;
      if (!root) return;
      root.style.setProperty('font-size', '200%', 'important');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bump);
    bump();
  });
}

async function emulateSlow3G(context, page) {
  const client = await context.newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1000) / 8,
    uploadThroughput: (500 * 1000) / 8,
  });
}

/**
 * @param {string} label
 * @param {object} contextOptions
 * @param {{ slow3g?: boolean, timeout?: number, largeText?: boolean }} [opts]
 */
async function loadPlay(browser, label, contextOptions, opts = {}) {
  const timeout = opts.timeout || 12000;
  const context = await browser.newContext(contextOptions);
  if (opts.largeText) await withLargeText(context);
  const page = await context.newPage();
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  if (opts.slow3g) await emulateSlow3G(context, page);
  try {
    await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(() => {
      const h = document.querySelector('h1');
      return !!(h && /Grow with Pip!/.test(h.textContent || ''));
    }, { timeout });
    await page.waitForTimeout(1200);
  } catch (e) {
    const msg = String(e && e.message || e).split('\n')[0];
    if (/crash|Target closed|has been closed/i.test(msg)) crashed = true;
    else if (!crashed) fail(`${label}: ${msg}`);
  }
  if (crashed) fail(`${label}: page crashed`);
  else if (!failures.some((f) => f.startsWith(label + ':'))) {
    let title = '';
    try { title = await page.locator('h1').first().innerText(); } catch { title = ''; }
    if (/Grow with Pip!/.test(title)) ok(`${label}: loaded`);
    else fail(`${label}: h1 was ${JSON.stringify(title)}`);
  }
  await context.close().catch(() => {});
}

const GATED = { ok: true, unlocked: false, gated: true, countdownSeconds: 10, playedSeconds: 300 };
const OPEN = { ok: true, unlocked: true, gated: true, countdownSeconds: 10, playedSeconds: 300 };
const NO_CHARGE = "No charge was made. Family play is here whenever you're ready.";

function jsonRoute(body) {
  return (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function tapsAndOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const small = [...document.querySelectorAll('#kide-grownup button, #kide-no-charge button')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      return b.width < 44 || b.height < 44;
    }).map((el) => (el.id || el.textContent || '').trim().slice(0, 40)
      + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
    return { overflow: de.scrollWidth - de.clientWidth, small };
  });
}

/**
 * Unpaid: free time is already used during a playtime, Pip's goodnight comes
 * first, then the grown-up ask. Paid: the account flag or a purchase status
 * never shows that ask. Cancelled checkout leaves the no-charge note on /play.
 */
async function familyUnlockJourneys(browser) {
  const profiles = [
    ['320px', {
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    }],
    ['Pixel 7', devices['Pixel 7']],
  ];

  for (const [label, options] of profiles) {
    const context = await browser.newContext(options);
    await context.addInitScript(() => { window.__kideSession = true; });
    const page = await context.newPage();
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    await page.route('**/api/unlock/**', jsonRoute(GATED));
    await page.route('**/api/account/session', jsonRoute({ parentId: null, unlocked: false }));
    try {
      const statusHit = page.waitForResponse((r) => r.url().includes('/api/unlock/status'), { timeout: 8000 });
      await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await statusHit;
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('kide:session', { detail: { on: false, why: 'goodbye' } }));
      });
      await page.waitForSelector('#kide-grownup-title', { timeout: 9000 });
      const title = await page.locator('#kide-grownup-title').innerText();
      const go = await page.locator('#kide-grownup-go').innerText();
      if (!/That was today's free play/.test(title)) fail(`${label} unpaid title was ${JSON.stringify(title)}`);
      else if (go.trim() !== 'For grown-ups') fail(`${label} unpaid button was ${JSON.stringify(go)}`);
      else {
        const fit = await tapsAndOverflow(page);
        if (fit.overflow > 1) fail(`${label} unpaid overflow ${fit.overflow}px`);
        else if (fit.small.length) fail(`${label} unpaid taps ${fit.small.join(' | ')}`);
        else ok(`${label} unpaid: goodnight then grown-up ask`);
      }
      if (!crashed && /That was today's free play/.test(title)) {
        await page.click('#kide-grownup-go');
        await page.waitForSelector('h1', { timeout: 8000 });
        const h1 = await page.locator('h1').first().innerText();
        if (/grown-up check/i.test(h1)) ok(`${label} unpaid: ask opens /unlock/`);
        else fail(`${label} unpaid landed on ${JSON.stringify(h1)}`);
      }
    } catch (e) {
      if (crashed) fail(`${label} unpaid: page crashed`);
      else fail(`${label} unpaid: ${String(e && e.message || e).split('\n')[0]}`);
    }
    await context.close().catch(() => {});
  }

  const paid = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const paidPage = await paid.newPage();
  await paidPage.route('**/api/unlock/**', jsonRoute(OPEN));
  await paidPage.route('**/api/account/session', jsonRoute({ parentId: 'p_' + 'a'.repeat(32), unlocked: true }));
  try {
    await paidPage.goto(`${BASE}/play/?checkout=cancel`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await paidPage.waitForSelector('#kide-no-charge', { timeout: 8000 });
    const note = await paidPage.locator('#kide-no-charge p').innerText();
    if (note !== NO_CHARGE) fail(`cancel note was ${JSON.stringify(note)}`);
    else ok('cancel returns to play with the no-charge note');
    await paidPage.waitForTimeout(1200);
    await paidPage.evaluate(() => {
      document.dispatchEvent(new CustomEvent('kide:session', { detail: { on: true } }));
      document.dispatchEvent(new CustomEvent('kide:session', { detail: { on: false, why: 'goodbye' } }));
    });
    await paidPage.waitForTimeout(7000);
    const gate = await paidPage.locator('#kide-grownup').count();
    const fit = await tapsAndOverflow(paidPage);
    const search = await paidPage.evaluate(() => location.search);
    if (gate !== 0) fail('paid account showed the free-play gate');
    else if (fit.overflow > 1) fail(`cancel note overflow ${fit.overflow}px`);
    else if (fit.small.length) fail(`cancel note taps ${fit.small.join(' | ')}`);
    else if (search.includes('checkout=')) fail(`cancel query stuck in the address: ${search}`);
    else ok('paid account never sees the free-play gate');
    await paidPage.click('#kide-no-charge-ok');
    if (await paidPage.locator('#kide-no-charge').count() !== 0) fail('cancel note stayed after Keep playing');
    else ok('cancel note dismisses');
  } catch (e) {
    fail(`paid/cancel: ${String(e && e.message || e).split('\n')[0]}`);
  }
  await paid.close().catch(() => {});

  const account = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const accountPage = await account.newPage();
  await accountPage.route('**/api/unlock/**', (route) => route.abort());
  await accountPage.route('**/api/account/session', jsonRoute({ parentId: 'p_' + 'b'.repeat(32), unlocked: true }));
  try {
    await accountPage.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await accountPage.waitForResponse((r) => r.url().includes('/api/account/session'), { timeout: 8000 });
    await accountPage.waitForTimeout(400);
    await accountPage.evaluate(() => {
      window.__kideSession = true;
      document.dispatchEvent(new CustomEvent('kide:session', { detail: { on: false, why: 'goodbye' } }));
    });
    await accountPage.waitForTimeout(7000);
    const gate = await accountPage.locator('#kide-grownup').count();
    if (gate !== 0) fail('paid account saw the gate while purchase history was down');
    else ok('paid account skips the gate when purchase history does not answer');
  } catch (e) {
    fail(`account fallback: ${String(e && e.message || e).split('\n')[0]}`);
  }
  await account.close().catch(() => {});
}

const browser = await chromiumMod.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  console.log('\n/play on headless Chromium mobile profiles');
  await loadPlay(browser, 'Galaxy A55', devices['Galaxy A55']);
  await loadPlay(browser, 'Galaxy S8', devices['Galaxy S8']);
  await loadPlay(browser, 'Pixel 7', devices['Pixel 7']);
  await loadPlay(browser, '320px', {
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await loadPlay(browser, 'dark + 200% text', {
    ...devices['Pixel 7'],
    colorScheme: 'dark',
  }, { largeText: true });
  await loadPlay(browser, 'slow 3G', devices['Galaxy S8'], { slow3g: true, timeout: 25000 });
  await loadPlay(browser, 'iPhone SE', devices['iPhone SE']);

  console.log('\nreadable headers and 44px taps at 320px');
  const narrow = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await narrow.newPage();

  await page.goto(`${BASE}/clinician/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const headers = await page.evaluate(() => {
    const de = document.documentElement;
    const ths = [...document.querySelectorAll('th')].map((el) => parseFloat(getComputedStyle(el).fontSize));
    return {
      overflow: de.scrollWidth - de.clientWidth,
      min: ths.length ? Math.min(...ths) : 0,
      n: ths.length,
    };
  });
  if (headers.n > 0 && headers.min >= 12) ok(`clinician th ${headers.min}px`);
  else fail(`clinician th ${headers.min}px (n=${headers.n})`);
  if (headers.overflow <= 1) ok('clinician: no horizontal overflow');
  else fail(`clinician overflow ${headers.overflow}px`);

  for (const path of ['/for-slps/', '/sounds/s/']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const taps = await page.evaluate(() => {
      const de = document.documentElement;
      const box = (el) => {
        if (!el) return 0;
        const b = el.getBoundingClientRect();
        return Math.round(b.height);
      };
      return {
        overflow: de.scrollWidth - de.clientWidth,
        summary: box(document.querySelector('details > summary')),
        back: box(document.querySelector('a.back-link')),
      };
    });
    if (taps.summary >= 44) ok(`${path} summary ${taps.summary}px`);
    else fail(`${path} summary ${taps.summary}px`);
    if (path.startsWith('/sounds')) {
      if (taps.back >= 44) ok(`${path} back-link ${taps.back}px`);
      else fail(`${path} back-link ${taps.back}px`);
    }
    if (taps.overflow <= 1) ok(`${path} no horizontal overflow`);
    else fail(`${path} overflow ${taps.overflow}px`);
  }

  // Parent signup landed on main after the gate report. Same floor: 44px
  // taps, 12px type, no sideways scroll at 320px, and no dollar amount that
  // checkout does not state on this page.
  const accountFile = readFileSync('public/account/index.html', 'utf8');
  if (/\$\d+/.test(accountFile)) fail('account page states a dollar price');
  else ok('account page states no dollar price');

  const LONG_EMAIL = `${'a'.repeat(40)}@example.com`;
  await page.route('**/api/account/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, signedIn: false, message: 'Sign in with the code we email you.' }),
  }));
  await page.goto(`${BASE}/account/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.fill('#email', LONG_EMAIL);
  const account = await page.evaluate(() => {
    const de = document.documentElement;
    const small = [...document.querySelectorAll('button,a,input')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (el.hidden || b.width === 0 || b.height === 0) return false;
      return b.width < 44 || b.height < 44;
    }).map((el) => (el.id || el.className || el.tagName) + ' '
      + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
    const tiny = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (!text || text === '·') continue;
      const el = node.parentElement;
      if (!el) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) tiny.push(`${size}px ${text.slice(0, 32)}`);
    }
    return { overflow: de.scrollWidth - de.clientWidth, small, tiny };
  });
  if (account.overflow <= 1) ok('account: no horizontal overflow');
  else fail(`account overflow ${account.overflow}px`);
  if (account.small.length === 0) ok('account: taps >= 44px');
  else fail(`account taps ${account.small.join(' , ')}`);
  if (account.tiny.length === 0) ok('account: text >= 12px');
  else fail(`account text ${account.tiny.join(' , ')}`);

  await page.unroute('**/api/account/**');
  await page.route('**/api/account/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, signedIn: true, email: LONG_EMAIL, message: 'You are signed in.' }),
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((address) => {
    const who = document.getElementById('who');
    return who && who.textContent === 'Signed in as ' + address;
  }, LONG_EMAIL);
  const signed = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (signed <= 1) ok('account signed-in: no horizontal overflow');
  else fail(`account signed-in overflow ${signed}px`);

  await narrow.close();

  console.log('\nfamily unlock: paid skips the gate, unpaid goodnight still asks');
  await familyUnlockJourneys(browser);
} finally {
  await browser.close().catch(() => {});
  srv.kill();
}

console.log(failures.length ? `\n${failures.length} failed` : '\nOK');
if (failures.length) process.exit(1);
