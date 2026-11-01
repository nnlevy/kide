// Money path: visit → tool use → signup → paid step → Stripe.
// Family unlock and the play countdown. No live Stripe call, no secret key.

import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';

import { handleUnlock } from './src/unlock/handler.js';
import {
  AMOUNT_CENTS,
  AMOUNT_LABEL,
  ENTITLEMENT_WAIT_MS,
  FREE_PLAY_MINUTES,
  OFFERING_ID,
  STRIPE_PRICE_ID,
  STRIPE_PRODUCT_ID,
} from './src/unlock/config.js';
import { checkoutInput, httpsUrl } from './src/unlock/checkout.js';
import { COPY, readable } from './src/unlock/copy.js';
import { purchaseGrantsUnlock } from './src/unlock/entitlement.js';
import { advance, overLimit } from './src/unlock/minutes.js';
import { answerMatches, makeHold, nextPoll, ENTITLEMENT_WAIT_MS as WAIT } from './public/unlock/gate.js';
import { isMeasured } from './public/engine/measure.js';

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

function memoryKv() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    dump() { return [...m.values()].join('\n'); },
  };
}

function billing(credits, checkout) {
  const calls = [];
  let creditReads = 0;
  return {
    calls,
    creditReads: () => creditReads,
    async getCredits() {
      creditReads++;
      if (typeof credits === 'function') return credits();
      return credits;
    },
    async createCheckout(input) {
      calls.push(input);
      return checkout === undefined
        ? { ok: true, id: 'cs_test_fake', url: 'https://checkout.stripe.com/c/pay/cs_test_fake' }
        : checkout;
    },
  };
}

function req(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://kide.us' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookiePair(res) {
  const raw = res.headers.get('set-cookie') || '';
  const pair = raw.split(';')[0];
  return pair.includes('=') ? pair : '';
}

const SESSION = '__Host-rft_session=abcdefghijklmnopqrstuvwxyzABCDEFGHIJK12345';

console.log('\nconfig names the live family price');

await t('price id is the live family price and not a secret', () => {
  assert.equal(STRIPE_PRICE_ID, 'price_1UWqYjIzTeKgjbPrOtu7jVAG');
  assert.equal(STRIPE_PRODUCT_ID, 'prod_VXwRuRo0HAZXKh');
  assert.equal(OFFERING_ID, 'family_unlock');
  assert.equal(AMOUNT_CENTS, 1500);
  assert.equal(AMOUNT_LABEL, '$15');
  assert.equal(FREE_PLAY_MINUTES, 5);
  const files = [
    'src/unlock/config.js', 'src/unlock/handler.js', 'src/unlock/checkout.js',
    'public/unlock/index.html', 'public/unlock/parent.js', 'public/unlock/timer.js',
  ].map((p) => readFileSync(p, 'utf8')).join('\n');
  assert(!/sk_live|sk_test|rk_live|rk_test|whsec_/.test(files), 'a live secret landed in the unlock module');
  assert(!/api\.stripe\.com/.test(files), 'unlock code calls Stripe directly');
  assert(!/PLACEHOLDER/.test(files), 'the family price is still a placeholder');
});

await t('checkout input reuses the hub fields and returns to play on cancel', () => {
  const input = checkoutInput({ origin: 'https://kide.us', email: 'parent@example.com' });
  assert.equal(input.domain, 'kide.us');
  assert.equal(input.offeringId, 'family_unlock');
  assert.equal(input.priceId, STRIPE_PRICE_ID);
  assert.equal(input.sourceDomain, 'kide.us');
  assert.equal(input.cancelUrl, 'https://kide.us/play/');
  assert.equal(input.successUrl, 'https://kide.us/unlock/?checkout=success&email=parent%40example.com');
  assert(!/data=/.test(input.successUrl + input.cancelUrl));
  assert.equal(httpsUrl('https://checkout.stripe.com/c/pay/cs_test_fake'), 'https://checkout.stripe.com/c/pay/cs_test_fake');
  assert.equal(httpsUrl('http://checkout.stripe.com/c/pay/x'), null);
  assert.equal(httpsUrl('javascript:alert(1)'), null);
});

await t('purchase history must name the family offering', () => {
  const cfg = { offeringId: 'family_unlock', priceId: STRIPE_PRICE_ID, domain: 'kide.us' };
  assert.deepEqual(purchaseGrantsUnlock(null, cfg), { known: false, unlocked: false });
  assert.deepEqual(purchaseGrantsUnlock({ ok: false }, cfg), { known: false, unlocked: false });
  assert.equal(purchaseGrantsUnlock({
    ok: true,
    summaries: [{ domain: 'kide.us', creditsPurchased: 9 }],
  }, cfg).unlocked, false, 'a bare credit total is the clinician signal');
  assert.equal(purchaseGrantsUnlock({
    ok: true,
    summaries: [{ domain: 'kide.us', offeringId: 'family_unlock', creditsPurchased: 1 }],
  }, cfg).unlocked, true);
  assert.equal(purchaseGrantsUnlock({
    ok: true,
    purchases: [{ domain: 'kide.us', priceId: STRIPE_PRICE_ID, status: 'paid' }],
  }, cfg).unlocked, true);
  assert.equal(purchaseGrantsUnlock({
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'refunded' }],
  }, cfg).unlocked, false);
  assert.equal(purchaseGrantsUnlock({
    ok: true,
    purchases: [{ domain: 'other.example', offeringId: 'family_unlock', status: 'paid' }],
  }, cfg).unlocked, false);
});

console.log('\ngrown-up hold and the ten second wait');

await t('the hold is adult arithmetic and the wait stops at the budget', () => {
  const sequence = [0, 0.5];
  const hold = makeHold(() => sequence.shift());
  assert.equal(hold.prompt, 'What is 12 + 26?');
  assert.equal(hold.answer, 38);
  assert.equal(answerMatches(hold, '38'), true);
  assert.equal(answerMatches(hold, ' 38 '), true);
  assert.equal(answerMatches(hold, '37'), false);
  assert.equal(answerMatches(hold, '3<script>'), false);
  assert.equal(WAIT, ENTITLEMENT_WAIT_MS);
  assert.equal(ENTITLEMENT_WAIT_MS, 10000);
  const started = 1_000;
  assert.equal(nextPoll({ started, now: started + 2000, budget: 10000 }, { unlocked: false }).done, false);
  assert.equal(nextPoll({ started, now: started + 2000, budget: 10000 }, { unlocked: true }).unlocked, true);
  assert.equal(nextPoll({ started, now: started + 10000, budget: 10000 }, { unlocked: false }).done, true);
});

await t('a minute step follows the server clock, not the body', () => {
  assert.equal(advance(null, 1_000, 20).seconds, 0);
  assert.equal(advance({ seconds: 10, lastTickMs: 1_000 }, 21_000, 20).seconds, 30);
  assert.equal(advance({ seconds: 10, lastTickMs: 1_000 }, 5_000_000, 20).seconds, 30);
  assert.equal(overLimit(299, 5), false);
  assert.equal(overLimit(300, 5), true);
});

console.log('\nthe timer survives a reload and a paid parent skips it');

const paid = {
  ok: true,
  purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', priceId: STRIPE_PRICE_ID, status: 'paid' }],
};
const unpaid = { ok: true, purchases: [] };

await t('five minutes gates, and a new request with the same device is still gated', async () => {
  const kv = memoryKv();
  const env = { KIDE_LEADS: kv, PORTFOLIO_BILLING_SERVICE: billing(unpaid) };
  let now = Date.parse('2026-11-01T15:00:00Z');
  let cookie = '';
  const hit = async (path, body) => {
    const res = await handleUnlock(req(path, { method: body ? 'POST' : 'GET', cookie, body }), env, { now });
    const next = cookiePair(res);
    if (next) cookie = next;
    return res.json();
  };
  let data = await hit('/api/unlock/tick', { seconds: 99999, targets: 'r_initial', childName: 'Ada' });
  assert.equal(data.playedSeconds, 0);
  assert.equal(data.gated, false);
  for (let i = 0; i < 15; i++) {
    now += 20_000;
    data = await hit('/api/unlock/tick', { seconds: 0 });
  }
  assert.equal(data.playedSeconds, 300);
  assert.equal(data.gated, true);
  assert.equal(data.unlocked, false);
  assert(!/Ada|r_initial|targets/.test(kv.dump()), 'play data was stored with the minute count');
  const again = await hit('/api/unlock/status');
  assert.equal(again.gated, true, 'reload lost the minute count');
  now = Date.parse('2026-11-02T15:00:00Z');
  const tomorrow = await hit('/api/unlock/status');
  assert.equal(tomorrow.gated, false);
  assert.equal(tomorrow.playedSeconds, 0);
});

await t('a purchase sticks on the device and gates the timer off', async () => {
  const kv = memoryKv();
  let credits = unpaid;
  const hub = billing(() => credits);
  const env = { KIDE_LEADS: kv, PORTFOLIO_BILLING_SERVICE: hub };
  let now = Date.parse('2026-11-01T15:00:00Z');
  let cookie = '';
  const hit = async (path, body, extraCookie = '') => {
    const res = await handleUnlock(req(path, {
      method: body ? 'POST' : 'GET',
      cookie: [cookie, extraCookie].filter(Boolean).join('; '),
      body,
    }), env, { now });
    const next = cookiePair(res);
    if (next) cookie = next;
    return { res, data: await res.json() };
  };
  await hit('/api/unlock/tick', {});
  for (let i = 0; i < 15; i++) {
    now += 20_000;
    await hit('/api/unlock/tick', {});
  }
  const gated = await hit('/api/unlock/status');
  assert.equal(gated.data.gated, true);

  const before = hub.creditReads();
  const denied = await hit('/api/unlock/confirm', { email: 'Parent@Example.com', offeringId: 'clinician_report' });
  assert.equal(denied.data.unlocked, false);

  credits = paid;
  const bought = await hit('/api/unlock/confirm', { email: 'parent@example.com' });
  assert.equal(bought.data.unlocked, true);
  const readsAfterBuy = hub.creditReads();
  const open = await hit('/api/unlock/status');
  assert.equal(open.data.unlocked, true);
  assert.equal(open.data.gated, false);
  assert.equal(hub.creditReads(), readsAfterBuy, 'a fresh unlock called the hub again');
  const ticked = await hit('/api/unlock/tick', { seconds: 99999 });
  assert.equal(ticked.data.gated, false);

  const deviceOnly = cookie;
  const otherBrowser = await handleUnlock(
    req('/api/unlock/status', { cookie: deviceOnly }),
    env,
    { now: now + 1000 },
  );
  assert.equal((await otherBrowser.json()).unlocked, true);

  credits = unpaid;
  now += 61_000;
  const revoked = await hit('/api/unlock/status');
  assert.equal(revoked.data.unlocked, false);
  assert.equal(revoked.data.gated, true);
  assert.ok(before >= 0);
});

await t('a purchase records the parent unlock flag and a refund clears it', async () => {
  const rows = [];
  const DB = {
    prepare() {
      return { bind(...args) { return { run: async () => { rows.push(args); } }; } };
    },
    async batch() {},
  };
  let credits = paid;
  const env = { KIDE_LEADS: memoryKv(), DB, PORTFOLIO_BILLING_SERVICE: billing(() => credits) };
  const bought = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    body: { email: 'parent@example.com' },
  }), env, { now: 1 });
  assert.equal((await bought.json()).unlocked, true);
  const active = rows.at(-1);
  assert.match(active[0], /^p_[a-f0-9]{32}$/);
  assert.equal(active[1], 'unlock');
  assert.equal(active[2], 'family_unlock');
  assert.equal(active[3], 'active');
  credits = {
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'refunded' }],
  };
  const revoked = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    body: { email: 'parent@example.com' },
  }), env, { now: 2 });
  assert.equal((await revoked.json()).unlocked, false);
  assert.equal(rows.at(-1)[3], 'inactive');
  const licence = {
    ok: true,
    summaries: [{ domain: 'kide.us', creditsPurchased: 1 }],
  };
  const clinician = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    body: { email: 'clinician@example.com' },
  }), {
    KIDE_LEADS: memoryKv(),
    DB,
    PORTFOLIO_BILLING_SERVICE: billing(licence),
  }, { now: 3 });
  assert.equal((await clinician.json()).unlocked, false);
  assert.equal(rows.at(-1)[3], 'inactive');
});

await t('a hub miss does not take a paid unlock away', async () => {
  const kv = memoryKv();
  let mode = 'paid';
  const hub = billing(() => {
    if (mode === 'throw') throw new Error('hub down');
    return paid;
  });
  const env = { KIDE_LEADS: kv, PORTFOLIO_BILLING_SERVICE: hub };
  const now = Date.parse('2026-11-01T15:00:00Z');
  const first = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    body: { email: 'parent@example.com' },
  }), env, { now });
  const cookie = cookiePair(first);
  assert.equal((await first.json()).unlocked, true);
  mode = 'throw';
  const later = await handleUnlock(req('/api/unlock/status', { cookie }), env, { now: now + 120_000 });
  const data = await later.json();
  assert.equal(data.unlocked, true);
  assert.equal(data.gated, false);
});

await t('checkout goes through the billing binding and ignores a swapped offering', async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => { fetches++; throw new Error('live fetch'); };
  try {
    const hub = billing(unpaid);
    const env = { KIDE_LEADS: memoryKv(), PORTFOLIO_BILLING_SERVICE: hub };
    const res = await handleUnlock(req('/api/unlock/checkout', {
      method: 'POST',
      body: { email: 'parent@example.com', offeringId: 'clinician_report', record: { targets: [] } },
    }), env, { now: 1 });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.url, 'https://checkout.stripe.com/c/pay/cs_test_fake');
    assert.equal(hub.calls.length, 1);
    assert.equal(hub.calls[0].offeringId, 'family_unlock');
    assert.equal(hub.calls[0].priceId, STRIPE_PRICE_ID);
    assert.equal(hub.calls[0].cancelUrl, 'https://kide.us/play/');
    assert(!('record' in hub.calls[0]));
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await t('a bad checkout answer stays in parent language', async () => {
  const env = { KIDE_LEADS: memoryKv(), PORTFOLIO_BILLING_SERVICE: billing(unpaid, { ok: false, url: 'http://insecure.example/pay' }) };
  const res = await handleUnlock(req('/api/unlock/checkout', {
    method: 'POST',
    body: { email: 'parent@example.com' },
  }), env, { now: 1 });
  const data = await res.json();
  assert.equal(res.status, 502);
  assert.equal(data.message, COPY.retry);
  assert.equal(readable(data.message), true);
  const missing = await handleUnlock(req('/api/unlock/checkout', {
    method: 'POST',
    body: { email: 'not-an-email' },
  }), { KIDE_LEADS: memoryKv() }, { now: 1 });
  assert.equal((await missing.json()).message, COPY.needEmail);
  const down = await handleUnlock(req('/api/unlock/checkout', {
    method: 'POST',
    body: { email: 'parent@example.com' },
  }), { KIDE_LEADS: memoryKv() }, { now: 1 });
  assert.equal(down.status, 503);
  assert.equal(readable((await down.json()).message), true);
});

await t('the device cookie is host-only storage and the session token stays out of JSON', async () => {
  const env = {
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_MESSAGING_SERVICE: {
      async currentSession() { return { ok: true, email: 'parent@example.com' }; },
    },
    PORTFOLIO_BILLING_SERVICE: billing(unpaid),
  };
  const res = await handleUnlock(req('/api/unlock/status', { cookie: SESSION }), env, { now: 1 });
  const raw = res.headers.get('set-cookie') || '';
  assert.match(raw, /^kide_device=[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=31536000$/);
  const body = await res.text();
  assert(!body.includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJK12345'));
  assert(!body.includes('session'));
});

console.log('\nvisitor copy and the pages');

await t('visitor sentences and the new pages avoid gate words', () => {
  for (const text of Object.values(COPY)) assert.equal(readable(text), true, text);
  const pages = ['public/unlock/index.html', 'public/unlock/parent.js', 'public/unlock/timer.js', 'public/unlock/gate.js']
    .map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const word of ['currently', 'fastest', 'best', 'leading', 'available', 'error', 'failed', 'exception']) {
    assert(!new RegExp(`\\b${word}\\b`, 'i').test(pages), `visitor file says ${word}`);
  }
  const html = readFileSync('public/unlock/index.html', 'utf8');
  assert(/id="pay" hidden/.test(html), 'the price is in the first paint');
  assert(/id="family-price" href="\/unlock\/#family-price">\$15<\/a>/.test(html));
  assert(!/measure\.js/.test(html));
  assert.equal(isMeasured('/unlock'), false);
  assert.equal(isMeasured('/play'), false);
  const timer = readFileSync('public/unlock/timer.js', 'utf8');
  assert(!/\$\d/.test(timer), 'the countdown names a price');
  assert(/Pip needs a grown-up/.test(timer));
  assert(/\/unlock\//.test(timer));
  const play = readFileSync('public/play/index.html', 'utf8');
  assert(/<script src="\/unlock\/timer\.js"><\/script>/.test(play));
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  assert(/handleUnlock/.test(worker));
  assert(/const OFFERINGS = new Set\(\["clinician_report"\]\)/.test(worker));
  assert(!/consumeCredits|grantCredits/.test(readFileSync('src/unlock/handler.js', 'utf8')));
});

console.log('\nfamily play page at 320px');

async function browserCheck() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('  SKIP browser: playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    console.log('  SKIP browser: ' + String(e.message || e).split('\n')[0]);
    return;
  }
  const port = 9141;
  const srv = spawn('python3', ['-c', `
import http.server, socketserver, os
os.chdir("public")
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class T(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
T(("127.0.0.1", ${port}), H).serve_forever()
`], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  const page = await browser.newPage({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  try {
    await page.goto(`http://127.0.0.1:${port}/unlock/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#prompt');
    const before = await page.evaluate(() => {
      const de = document.documentElement;
      const text = document.body.innerText;
      const small = [...document.querySelectorAll('button,a,input,select')].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return false;
        return b.width < 44 || b.height < 44;
      }).map((el) => (el.id || el.textContent || el.tagName).trim().slice(0, 40)
        + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height));
      const tiny = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const value = node.textContent.replace(/\s+/g, ' ').trim();
        if (!value) continue;
        const el = node.parentElement;
        if (!el || el.closest('[hidden]')) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12) tiny.push(size + 'px ' + value.slice(0, 32));
      }
      return {
        overflow: de.scrollWidth - de.clientWidth,
        text,
        small,
        tiny,
        payHidden: document.getElementById('pay').hidden,
      };
    });
    assert.ok(before.payHidden, 'price panel is visible before the hold');
    assert.ok(!before.text.includes('$'), 'a price is visible before the hold');
    assert.ok(before.overflow <= 1, `overflow ${before.overflow}px`);
    assert.equal(before.small.length, 0, before.small.join(' | '));
    assert.equal(before.tiny.length, 0, before.tiny.join(' | '));

    const prompt = await page.locator('#prompt').innerText();
    const match = prompt.match(/What is (\d+) \+ (\d+)\?/);
    assert.ok(match, 'prompt was ' + prompt);
    await page.fill('#answer', '1');
    await page.click('#check');
    await page.waitForFunction(() => document.getElementById('holdMsg').textContent.includes('does not match'));
    assert.equal(await page.locator('#pay').getAttribute('hidden'), '', 'wrong answer revealed the price');

    await page.fill('#answer', String(Number(match[1]) + Number(match[2])));
    await page.click('#check');
    await page.waitForSelector('#pay:not([hidden])');
    const price = await page.locator('#family-price').innerText();
    assert.equal(price, '$15');
    const href = await page.locator('#family-price').getAttribute('href');
    assert.ok(href.includes('#family-price'));
    const after = await page.evaluate(() => {
      const price = document.getElementById('family-price').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        price: Math.round(price.width) + 'x' + Math.round(price.height),
        priceOk: price.width >= 44 && price.height >= 44,
      };
    });
    assert.ok(after.overflow <= 1, `overflow after the hold ${after.overflow}px`);
    assert.equal(after.priceOk, true, after.price);
    console.log('  ok   unlock page at 320px');
    pass++;
  } catch (e) {
    console.log(`  FAIL unlock page at 320px\n       ${e.message}`);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    srv.kill();
  }
}

await browserCheck();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
