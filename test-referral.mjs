// Money path: A's share link → B's $15 family_unlock → A pending $6.
// Cash lives in kide_referral_* only. No Stripe Connect account, price, or transfer.

import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { parentIdFor } from './src/account/parent-id.js';
import { setUnlock } from './src/account/store.js';
import { handleUnlock } from './src/unlock/handler.js';
import { STRIPE_PRICE_ID } from './src/unlock/config.js';
import { readable } from './src/unlock/copy.js';
import {
  HOLD_MS,
  PAYOUT_AT_CENTS,
  PAYOUT_METHOD,
  REWARD_CENTS,
  codeByValue,
  earningsFor,
  ipCluster,
  issueCode,
  listPayoutQueue,
} from './src/referral/ledger.js';
import { applyClearedPurchase, applyRefund } from './src/referral/apply.js';
import { EARNINGS_COPY, handleEarnings, handleRefLanding, handleReferralHttp } from './src/referral/http.js';

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail++;
  }
};

function memoryDb() {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql, args) => {
    const stmt = sqlite.prepare(sql);
    const runArgs = args.length ? args : [];
    return {
      async run() {
        if (runArgs.length) stmt.run(...runArgs);
        else stmt.run();
        return { success: true };
      },
      async all() {
        const rows = runArgs.length ? stmt.all(...runArgs) : stmt.all();
        return { results: rows.map((row) => ({ ...row })) };
      },
      async first() {
        const row = runArgs.length ? stmt.get(...runArgs) : stmt.get();
        return row ? { ...row } : null;
      },
    };
  };
  return {
    prepare(sql) {
      const api = wrap(sql, []);
      api.bind = (...args) => wrap(sql, args);
      return api;
    },
    names() {
      return sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map((row) => row.name);
    },
  };
}

function memoryKv() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
  };
}

function req(path, { method = 'GET', cookie = '', body, ip } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (ip) headers['cf-connecting-ip'] = ip;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://kide.us' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const DAY = Date.parse('2026-11-05T12:00:00Z');

function hub(events) {
  return {
    events,
    async notifyReferralActivity(input) { events.push(input); return { ok: true }; },
  };
}

async function parent(email) {
  return parentIdFor('email', email);
}

console.log('\ncash ledger, separate from credits');

await t('a referred family_unlock leaves the sharer pending $6', async () => {
  const db = memoryDb();
  const events = [];
  const env = { DB: db, PORTFOLIO_BILLING_SERVICE: hub(events) };
  const a = await parent('a@example.com');
  const b = await parent('b@example.com');
  const issued = await issueCode(db, { parentId: a, email: 'a@example.com', phone: '+1 415 555 0100', ip: '198.51.100.8' });
  const bought = await applyClearedPurchase(env, {
    code: issued.code,
    buyerId: b,
    buyerPhone: '+1 212 555 0199',
    buyerCardFp: 'card_bbbb',
    buyerIp: '203.0.113.10',
    purchaseRef: 'cs_test_b_family',
    paidAt: DAY,
    now: DAY,
    offeringId: 'family_unlock',
  });
  assert.equal(bought.ok, true);
  assert.equal(bought.fresh, true);
  assert.equal(bought.amountCents, 600);
  const view = await earningsFor(db, a, DAY);
  assert.equal(view.pendingCents, REWARD_CENTS);
  assert.equal(view.availableCents, 0);
  assert.equal(view.paidCents, 0);
  assert.equal(view.link, `https://kide.us/r/${issued.code}`);
  const again = await applyClearedPurchase(env, {
    code: issued.code,
    buyerId: b,
    purchaseRef: 'cs_test_b_family',
    paidAt: DAY,
    now: DAY,
    offeringId: 'family_unlock',
  });
  assert.equal(again.fresh, false);
  assert.equal((await earningsFor(db, a, DAY)).pendingCents, 600);
  assert.equal(events.filter((e) => e.event === 'pending').length, 1);
  assert.equal(events[0].live, false);
  assert.equal(events.find((e) => e.event === 'pending').amountCents, 600);
  const names = db.names();
  assert.deepEqual(names.filter((n) => n.startsWith('kide_referral_')).sort(), [
    'kide_referral_codes',
    'kide_referral_ledger',
    'kide_referral_payouts',
  ]);
  assert.equal(names.includes('kide_entitlements'), false);
  assert.equal(names.some((n) => /credit/i.test(n)), false);
});

await t('a refund reverses the $6', async () => {
  const db = memoryDb();
  const env = { DB: db, PORTFOLIO_BILLING_SERVICE: hub([]) };
  const a = await parent('a@example.com');
  const b = await parent('b@example.com');
  const issued = await issueCode(db, { parentId: a, email: 'a@example.com' });
  await applyClearedPurchase(env, {
    code: issued.code, buyerId: b, purchaseRef: 'cs_test_b_family', paidAt: DAY, now: DAY, offeringId: 'family_unlock',
  });
  const reversed = await applyRefund(env, { buyerId: b, purchaseRef: 'cs_test_b_family', now: DAY + 1000 });
  assert.equal(reversed.reversed, true);
  const view = await earningsFor(db, a, DAY + 1000);
  assert.equal(view.pendingCents, 0);
  assert.equal(view.availableCents, 0);
  assert.equal(view.paidCents, 0);
  assert.equal(view.families, 0);
});

await t('self-referral is rejected for the same parent, phone, card, or IP cluster', async () => {
  const db = memoryDb();
  const env = { DB: db };
  const a = await parent('a@example.com');
  const b = await parent('b@example.com');
  const issued = await issueCode(db, {
    parentId: a,
    email: 'a@example.com',
    phone: '+14155550100',
    cardFp: 'card_aaaa',
    ip: '203.0.113.4',
  });
  const base = { code: issued.code, paidAt: DAY, now: DAY, offeringId: 'family_unlock' };
  const sameParent = await applyClearedPurchase(env, { ...base, buyerId: a, purchaseRef: 'self-parent', buyerIp: '198.51.100.9' });
  const samePhone = await applyClearedPurchase(env, { ...base, buyerId: b, buyerPhone: '415-555-0100', purchaseRef: 'self-phone', buyerIp: '198.51.100.9' });
  const sameCard = await applyClearedPurchase(env, { ...base, buyerId: b, buyerCardFp: 'card_aaaa', purchaseRef: 'self-card', buyerIp: '198.51.100.9' });
  const sameNet = await applyClearedPurchase(env, { ...base, buyerId: b, buyerIp: '203.0.113.250', purchaseRef: 'self-ip' });
  const other = await applyClearedPurchase(env, {
    ...base, buyerId: b, buyerPhone: '+12125550199', buyerCardFp: 'card_bbbb', buyerIp: '198.51.100.20', purchaseRef: 'ok-b',
  });
  assert.equal(sameParent.reason, 'self');
  assert.equal(samePhone.reason, 'self');
  assert.equal(sameCard.reason, 'self');
  assert.equal(sameNet.reason, 'self');
  assert.equal(ipCluster('203.0.113.4'), ipCluster('203.0.113.250'));
  assert.equal(other.ok, true);
  assert.equal((await earningsFor(db, a, DAY)).pendingCents, 600);
  const clinician = await applyClearedPurchase(env, {
    ...base, buyerId: await parent('c@example.com'), purchaseRef: 'licence', offeringId: 'clinician_report', buyerIp: '192.0.2.8',
  });
  assert.equal(clinician.reason, 'not_family');
  assert.equal((await earningsFor(db, a, DAY)).pendingCents, 600);
});

await t('after 14 days the $6 is available, and $50 opens one send request', async () => {
  const db = memoryDb();
  const env = { DB: db, PORTFOLIO_BILLING_SERVICE: hub([]) };
  const a = await parent('a@example.com');
  const issued = await issueCode(db, { parentId: a, email: 'a@example.com', ip: '192.0.2.10' });
  for (let i = 0; i < 8; i++) {
    const buyer = await parent(`friend${i}@example.com`);
    const out = await applyClearedPurchase(env, {
      code: issued.code,
      buyerId: buyer,
      buyerIp: `198.51.${i}.10`,
      purchaseRef: `cs_test_${i}`,
      paidAt: DAY,
      now: DAY,
      offeringId: 'family_unlock',
    });
    assert.equal(out.ok, true, out.reason);
  }
  const early = await earningsFor(db, a, DAY + HOLD_MS - 1);
  assert.equal(early.pendingCents, 8 * REWARD_CENTS);
  assert.equal(early.availableCents, 0);
  assert.equal((await listPayoutQueue(db)).length, 0);
  const ninth = await parent('friend8@example.com');
  await applyClearedPurchase(env, {
    code: issued.code, buyerId: ninth, buyerIp: '198.51.100.10', purchaseRef: 'cs_test_8', paidAt: DAY, now: DAY, offeringId: 'family_unlock',
  });
  const ready = await earningsFor(db, a, DAY + HOLD_MS);
  assert.equal(ready.pendingCents, 0);
  assert.equal(ready.availableCents, 9 * REWARD_CENTS);
  assert.equal(ready.paidCents, 0);
  assert.ok(ready.availableCents >= PAYOUT_AT_CENTS);
  const queue = await listPayoutQueue(db);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].amount_cents, 5400);
  assert.equal(queue[0].method, PAYOUT_METHOD);
  assert.equal(Number(queue[0].live), 0);
  assert.equal(queue[0].id.startsWith('kide_rq_'), true);
  await applyRefund(env, { buyerId: ninth, purchaseRef: 'cs_test_8', now: DAY + HOLD_MS + 1 });
  const after = await earningsFor(db, a, DAY + HOLD_MS + 1);
  assert.equal(after.availableCents, 4800);
  assert.equal((await listPayoutQueue(db)).length, 0);
});

await t('confirming B through the share cookie credits A, and a refund takes it back', async () => {
  const db = memoryDb();
  const events = [];
  const a = await parent('a@example.com');
  const issued = await issueCode(db, { parentId: a, email: 'a@example.com', ip: '192.0.2.4' });
  const paid = {
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', priceId: STRIPE_PRICE_ID, status: 'paid', id: 'cs_test_b' }],
  };
  const env = { DB: db, KIDE_LEADS: memoryKv(), PORTFOLIO_BILLING_SERVICE: { ...hub(events), async getCredits() { return paid; } } };
  const confirm = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    cookie: `kide_ref=${issued.code}`,
    ip: '203.0.113.20',
    body: { email: 'b@example.com' },
  }), env, { now: DAY });
  assert.equal(confirm.status, 200);
  assert.equal((await confirm.json()).unlocked, true);
  const view = await earningsFor(db, a, DAY);
  assert.equal(view.pendingCents, 600);
  assert.equal(events.some((e) => e.event === 'pending' && e.amountCents === 600 && e.live === false), true);

  const refunded = {
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'refunded', id: 'cs_test_b' }],
  };
  env.PORTFOLIO_BILLING_SERVICE.getCredits = async () => refunded;
  const back = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    ip: '203.0.113.21',
    body: { email: 'b@example.com' },
  }), env, { now: DAY + 5000 });
  assert.equal((await back.json()).unlocked, false);
  assert.equal((await earningsFor(db, a, DAY + 5000)).pendingCents, 0);
  assert.equal(events.some((e) => e.event === 'reversed'), true);
});

await t('the sharer cannot be the buyer on the confirm path', async () => {
  const db = memoryDb();
  const aEmail = 'a@example.com';
  const a = await parent(aEmail);
  const issued = await issueCode(db, { parentId: a, email: aEmail, ip: '203.0.113.8' });
  const paid = {
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'paid', id: 'cs_test_self', cardFingerprint: 'card_same' }],
  };
  const env = {
    DB: db,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_BILLING_SERVICE: { async getCredits() { return paid; } },
  };
  await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    cookie: `kide_ref=${issued.code}`,
    ip: '198.51.100.8',
    body: { email: aEmail },
  }), env, { now: DAY });
  assert.equal((await earningsFor(db, a, DAY)).pendingCents, 0);
  assert.equal(await codeByValue(db, 'nope'), null);
});

await t('/r/<code> sets the share cookie and unknown codes do not', async () => {
  const db = memoryDb();
  const a = await parent('a@example.com');
  const issued = await issueCode(db, { parentId: a, email: 'a@example.com' });
  const res = await handleRefLanding(req(`/r/${issued.code.toLowerCase()}`), { DB: db }, issued.code.toLowerCase());
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `https://kide.us/?ref=${issued.code}`);
  assert.match(res.headers.get('set-cookie') || '', new RegExp(`kide_ref=${issued.code}`));
  const missing = await handleReferralHttp(req('/r/ZZZZZZZZ'), { DB: db });
  assert.equal(missing.status, 404);
  const junk = await handleReferralHttp(req('/r/<script>'), { DB: db });
  assert.equal(junk.status, 404);
});

await t('/parent/earnings reports pending, available, and paid for the signed-in parent', async () => {
  const db = memoryDb();
  const events = [];
  const email = 'a@example.com';
  const id = await parent(email);
  const env = {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: { async currentSession() { return { ok: true, email }; } },
    PORTFOLIO_BILLING_SERVICE: hub(events),
  };
  await setUnlock(env, id, 'family_unlock');
  const first = await handleEarnings(req('/api/parent/earnings', { cookie: 'session=1', ip: '192.0.2.15' }), env);
  const opened = await first.json();
  assert.equal(first.status, 200);
  assert.equal(opened.signedIn, true);
  assert.match(opened.link, /^https:\/\/kide\.us\/r\/[2-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(opened.pendingCents, 0);
  assert.equal(opened.availableCents, 0);
  assert.equal(opened.paidCents, 0);
  assert.equal(readable(opened.reward), true);
  const b = await parent('b@example.com');
  await applyClearedPurchase(env, {
    code: opened.code,
    buyerId: b,
    buyerIp: '203.0.113.40',
    purchaseRef: 'cs_test_from_page',
    paidAt: DAY,
    now: DAY,
    offeringId: 'family_unlock',
  });
  const second = await handleEarnings(req('/api/parent/earnings', { cookie: 'session=1' }), env);
  const shown = await second.json();
  assert.equal(shown.pendingCents, 600);
  assert.equal(shown.availableCents, 0);
  assert.equal(shown.paidCents, 0);
  const stranger = await handleEarnings(req('/api/parent/earnings'), { DB: db });
  const out = await stranger.json();
  assert.equal(out.signedIn, false);
  assert.equal(out.pendingCents, 0);
  assert.equal(readable(out.message), true);
  assert.equal(readable(EARNINGS_COPY.locked), true);
  const html = readFileSync('public/parent/earnings/index.html', 'utf8');
  assert.match(html, />Pending</);
  assert.match(html, />Available</);
  assert.match(html, />Paid</);
  assert.match(html, /class="preview"/);
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /stripe|ledger|webhook|operator|queue|connect/i);
  const js = readFileSync('public/parent/earnings/earnings.js', 'utf8');
  assert.doesNotMatch(js, /stripe|ledger|webhook|operator/i);
  const src = (readFileSync('src/referral/ledger.js', 'utf8') + readFileSync('src/referral/apply.js', 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(src, /api\.stripe\.com|consumeCredits|kide_entitlements|sk_live|sk_test/);
  assert.match(src, /live INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(readFileSync('src/worker/index.ts', 'utf8'), /notifyReferralActivity|issueCashReferralCode/);
});

await t('a paid parent on this device gets /r/<code> from the ledger', async () => {
  const db = memoryDb();
  const events = [];
  const paid = { ok: true, purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'paid' }] };
  const env = {
    DB: db,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_BILLING_SERVICE: {
      ...hub(events),
      async getCredits() { return paid; },
      async issueCashReferralCode() { throw new Error('hub codes are not the ledger'); },
    },
  };
  const confirmed = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST', body: { email: 'parent@example.com' },
  }), env, { now: DAY });
  const cookie = (confirmed.headers.get('set-cookie') || '').split(';')[0];
  const mine = await handleUnlock(req('/api/unlock/referral', {
    method: 'POST', cookie, body: { email: 'parent@example.com' },
  }), env, { now: DAY + 1 });
  const data = await mine.json();
  assert.equal(mine.status, 200);
  assert.match(data.link, /^https:\/\/kide\.us\/r\/[2-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(readable(data.reward), true);
  assert.equal(events.some((e) => e.event === 'code_issued'), true);
});

console.log('\nearnings page');

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
  const port = 9177;
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
  const page = await browser.newPage({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  try {
    await page.route('**/api/parent/earnings', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        signedIn: true,
        unlocked: true,
        pendingCents: 600,
        availableCents: 0,
        paidCents: 0,
        openSendCents: 0,
        link: 'https://kide.us/r/AB3DEFGH',
        message: '',
      }),
    }));
    await page.goto(`http://127.0.0.1:${port}/parent/earnings/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('pending').textContent === '$6');
    const seen = await page.evaluate(() => {
      const text = document.body.innerText;
      const de = document.documentElement;
      const small = [...document.querySelectorAll('button,a,input')].filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return false;
        return b.width < 44 || b.height < 44;
      }).map((el) => (el.id || el.textContent || '').trim().slice(0, 40));
      return {
        text,
        overflow: de.scrollWidth - de.clientWidth,
        share: document.getElementById('shareCard').hidden === false,
        small,
      };
    });
    assert.match(seen.text, /Pending/);
    assert.match(seen.text, /Available/);
    assert.match(seen.text, /Paid/);
    assert.match(seen.text, /\$6/);
    assert.equal(seen.share, true);
    assert.equal(seen.overflow, 0, 'horizontal overflow ' + seen.overflow);
    assert.deepEqual(seen.small, []);
    await page.click('#copyGo');
    await page.setViewportSize({ width: 1280, height: 800 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(wide, 0, 'desktop overflow ' + wide);
    await page.unroute('**/api/parent/earnings');
    await page.route('**/api/parent/earnings', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        signedIn: false,
        unlocked: false,
        pendingCents: 0,
        availableCents: 0,
        paidCents: 0,
        link: null,
        message: 'Sign in to see what your link has earned.',
      }),
    }));
    await page.goto(`http://127.0.0.1:${port}/parent/earnings/`, { waitUntil: 'networkidle' });
    const signedOut = await page.evaluate(() => ({
      text: document.body.innerText,
      share: document.getElementById('shareCard').hidden,
    }));
    assert.match(signedOut.text, /Sign in to see what your link has earned/);
    assert.match(signedOut.text, /Pending/);
    assert.equal(signedOut.share, true);
    console.log('  ok   earnings page at 320px and 1280px');
    pass++;
  } catch (e) {
    console.log(`  FAIL earnings page at 320px\n       ${e.message}`);
    fail++;
  } finally {
    await browser.close().catch(() => {});
    srv.kill();
  }
}

await browserCheck();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
