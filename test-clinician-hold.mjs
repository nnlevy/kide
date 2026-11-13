// The independent-review holds on the clinician chart.
//
// Three things a source assertion cannot see:
//   * a legacy ?data= link puts the record on the URL before the module runs,
//     and the stylesheet and clinical.js send that URL as Referer;
//   * Stripe drops the fragment, so the chart has to put it back from
//     sessionStorage without ever placing the record on the return URL;
//   * a populated chart was shipping 11px text, an uncited percent, and a
//     layout shift on a slow phone.
//
// Run: npm run build && node test-clinician-hold.mjs

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert';
import { auditBlocks, domainConfig } from './tools/platform-gate/claims.mjs';
import { browserOrSkip } from './test-browser.mjs';

const require = createRequire(import.meta.url);
const { extractBlocksExpr, parseBlocks } = require('./tools/platform-gate/extract-blocks.js');

const PORT = Number(process.env.CLINICIAN_HOLD_PORT || 9141);
const ROOT = join(process.cwd(), 'dist');
if (!existsSync(join(ROOT, 'clinician', 'index.html'))
    || !readFileSync(join(ROOT, 'clinician', 'index.html'), 'utf8').includes('history.replaceState')) {
  console.log('\n(skipped: run `npm run build` first — dist/clinician is missing the scrubber)\n');
  process.exit(process.env.CI ? 1 : 0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const c of [path, path + '.html', join(path, 'index.html')]) {
    const file = join(ROOT, c);
    if (file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const origin = `http://127.0.0.1:${PORT}`;

const chromium = await browserOrSkip('test-clinician-hold');
const browser = await chromium.launch({
  ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
  args: ['--no-sandbox'],
});

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

function sample(now = Date.now()) {
  const at = now - 1095 * 86400000;
  const events = Array.from({ length: 8 }, (_, i) => ({
    target: 'm_initial', word: 'moon', tier: 'gop-webgpu', verdict: 'clear',
    forced: false, level: 2, at: at + i * 1000,
  }));
  return Buffer.from(JSON.stringify(events), 'utf8').toString('base64');
}

const cfgAll = JSON.parse(readFileSync('tools/platform-gate/config/domains.json', 'utf8'));
const cfg = domainConfig(cfgAll, 'kide.us');

async function claimsOn(page) {
  const expression = extractBlocksExpr({
    siteHost: 'kide.us',
    ownPricePaths: cfg.ownPricePaths,
    portfolioDomains: cfg.portfolioDomains,
  });
  const raw = await page.evaluate((src) => (0, eval)(src), expression);
  return auditBlocks(parseBlocks(raw), cfg);
}

console.log('\na legacy ?data= link does not leave on a subresource');

await t('no stylesheet or script request carries the record', async () => {
  const b64 = sample();
  const marker = b64.replace(/[+/=]/g, '').slice(0, 32);
  const context = await browser.newContext();
  const page = await context.newPage();
  const seen = [];
  page.on('request', (req) => {
    seen.push({
      url: req.url(),
      type: req.resourceType(),
      referer: req.headers().referer || req.headers().referrer || '',
    });
  });
  await page.goto(`${origin}/clinician/?data=${encodeURIComponent(b64)}`, { waitUntil: 'load', timeout: 30000 });
  const doc = seen.filter((r) => r.type === 'document');
  const sub = seen.filter((r) => r.type !== 'document');
  assert(doc.some((r) => r.url.includes(marker)), 'the navigation itself did not carry the record, so this test cannot see a leak');
  assert(sub.some((r) => r.url.includes('mobile.css')), 'the stylesheet was not requested');
  assert(sub.some((r) => r.url.includes('clinical.js')), 'clinical.js was not requested');
  const leaked = sub.filter((r) => `${r.url}\n${r.referer}`.includes(marker));
  assert.equal(leaked.length, 0, `a subresource carried the record: ${JSON.stringify(leaked.slice(0, 3))}`);
  const loc = await page.evaluate(() => ({
    search: location.search,
    data: new URLSearchParams(location.hash.slice(1)).get('data'),
  }));
  assert.equal(loc.search.includes('data='), false, `the query still holds the record: ${loc.search.slice(0, 80)}`);
  assert.equal(loc.data, b64, 'the fragment does not hold the record the query arrived with');
  await context.close();
});

console.log('\nreturning from checkout keeps the fragment and leaves it off the return URL');

await t('sessionStorage restores the fragment and the checkout URL does not carry it', async () => {
  const b64 = sample();
  const context = await browser.newContext();
  const page = await context.newPage();
  const returnUrl = `${origin}/clinician/?checkout=success&email=${encodeURIComponent('slp@clinic.test')}`;
  await page.route('**/api/clinician/**', (route) => {
    const url = route.request().url();
    if (url.includes('/checkout')) {
      const body = route.request().postData() || '';
      assert(!body.includes(b64.replace(/[+/=]/g, '').slice(0, 32)), 'the checkout POST carries the record');
      assert(!returnUrl.includes(b64.slice(0, 16)), 'the return URL was built with the record in it');
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: returnUrl }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, licensed: true, email: 'slp@clinic.test' }),
    });
  });
  await page.goto(`${origin}/clinician/#data=${encodeURIComponent(b64)}`, { waitUntil: 'load', timeout: 30000 });
  await page.locator('#proEmail').fill('slp@clinic.test');
  await page.locator('#btnBuy').click();
  await page.waitForURL(/checkout=success/, { timeout: 15000 });
  await page.waitForFunction(() => /Practiced on/.test(document.body.innerText), null, { timeout: 15000 });
  const loc = await page.evaluate(() => ({
    href: location.href,
    search: location.search,
    data: new URLSearchParams(location.hash.slice(1)).get('data'),
  }));
  assert.equal(new URL(loc.href).searchParams.get('data'), null, 'the return URL query holds the record');
  assert(!loc.href.includes(b64.replace(/[+/=]/g, '').slice(0, 32)) || loc.href.includes('#'),
    'the record is on the URL outside the fragment');
  assert.equal(loc.search.includes(b64.slice(0, 12)), false, 'the record is in the query string');
  assert.equal(loc.data, b64, 'the fragment was not restored after checkout');
  const outsideFragment = loc.href.split('#')[0];
  assert.equal(outsideFragment.includes('data='), false, `the record is outside the fragment: ${outsideFragment}`);
  await context.close();
});

console.log('\na populated chart cites its figures and stays put on a slow phone');

await t('the populated record has no uncited figure and no text under 12px', async () => {
  const b64 = sample();
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${origin}/clinician/#data=${encodeURIComponent(b64)}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => /of the days in that span/.test(document.body.innerText));
  const text = await page.locator('#narrative').innerText();
  assert.match(text, /100% of the days in that span/);
  assert.match(text, /No practice in the last \d+ days/);
  assert.match(text, /Brown, Cai, and DasGupta \(2001\)/);
  const claims = await claimsOn(page);
  const uncited = claims.filter((c) => c.defects?.includes('uncited'));
  assert.equal(uncited.length, 0, `uncited: ${JSON.stringify(uncited.map((c) => ({ match: c.match, text: c.text })), null, 2)}`);
  const tiny = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('.sr-only, svg')) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(s.fontSize) < 12;
  }).map((el) => `${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 24)}" ${getComputedStyle(el).fontSize}`));
  assert.deepEqual(tiny, []);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await context.close();
});

await t('a slow phone does not shift the sheet while the record paints', async () => {
  const b64 = sample();
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(`(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} })()`);
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 51200, uploadThroughput: 51200 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${origin}/clinician/#data=${encodeURIComponent(b64)}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5000);
  const cls = await page.evaluate(() => window.__cls || 0);
  assert.ok(cls <= 0.1, `CLS ${cls}`);
  await context.close();
});

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
