// Money path: A's share link → B's $15 family_unlock → intended $6 cash at $50.
// This leaf adapts the five hub RPCs. It does not keep a second cash ledger.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

import { parentIdFor } from './src/account/parent-id.js';
import { setUnlock } from './src/account/store.js';
import { handleUnlock } from './src/unlock/handler.js';
import { STRIPE_PRICE_ID } from './src/unlock/config.js';
import { readable } from './src/unlock/copy.js';
import {
  CASH_CLOSED,
  CLAIM_SAVED,
  SHARE_REWARD,
  approvedProgram,
  closedCash,
  issueShareCode,
  noteFamilyUnlock,
  notifyReferralActivity,
  shareStatus,
} from './src/referral/apply.js';
import { EARNINGS_COPY, handleEarnings, handleRefLanding, handleReferralHttp } from './src/referral/http.js';
import { handleRefClaim } from './src/referral/invite.js';

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

function memoryDbSync() {
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

function messaging(email, extras = {}) {
  return {
    async currentSession() {
      return { ok: true, email, ...extras };
    },
  };
}

function cashHub({ events = [], code = 'AB3DEFGH', rewardLabel = '$5 for you when a family you shared with buys family play' } = {}) {
  return {
    events,
    async issueCashReferralCode(input) {
      events.push({ rpc: 'issue', ...input });
      if (input.fail) return { ok: false, reason: 'program_disabled' };
      return { ok: true, code, link: `https://kide.us/?ref=${code}`, rewardLabel };
    },
    async getCashReferralStatus(input) {
      events.push({ rpc: 'status', ...input });
      return {
        ok: true,
        code,
        link: `https://kide.us/?ref=${code}`,
        families: 3,
        earnedCents: 1500,
        paidCents: 500,
        rewardLabel,
      };
    },
    async notifyReferralActivity(input) {
      events.push({ rpc: 'notify', ...input });
      return { ok: true };
    },
    async getCashReferrerPublic(input) {
      events.push({ rpc: 'public', ...input });
      return { ok: true, found: input.code === code, firstName: 'Ada', claimable: false };
    },
    async getCredits() {
      return { ok: true, purchases: [] };
    },
  };
}

console.log('\nhub RPC adaptation; D1 is not a cash authority');

await t('issue and status use the five RPCs and never keep hub $5 cents', async () => {
  const events = [];
  const env = { PORTFOLIO_BILLING_SERVICE: cashHub({ events }) };
  const issued = await issueShareCode(env, { email: 'a@example.com' });
  assert.equal(issued.code, 'AB3DEFGH');
  assert.equal(issued.link, 'https://kide.us/?ref=AB3DEFGH');
  assert.equal(issued.reward, SHARE_REWARD);
  const view = await shareStatus(env, { email: 'a@example.com' });
  assert.equal(view.closed, true);
  assert.equal(view.pendingCents, 0);
  assert.equal(view.availableCents, 0);
  assert.equal(view.paidCents, 0);
  assert.equal(view.families, 0);
  assert.equal(view.earnedCents, 0);
  assert.equal(view.openSendCents, 0);
  assert.equal(view.link, 'https://kide.us/?ref=AB3DEFGH');
  assert.equal(approvedProgram({
    ok: true, rewardLabel: '$5 for you when a family you shared with buys family play', earnedCents: 1500,
  }), false);
  assert.equal(events.filter((e) => e.rpc === 'issue').length, 1);
  assert.deepEqual(events.find((e) => e.rpc === 'issue'), {
    rpc: 'issue', domain: 'kide.us', email: 'a@example.com',
  });
  assert.deepEqual(events.find((e) => e.rpc === 'status'), {
    rpc: 'status', domain: 'kide.us', email: 'a@example.com',
  });
});

await t('notify uses step link_open or checkout_open only', async () => {
  const events = [];
  const env = { PORTFOLIO_BILLING_SERVICE: cashHub({ events }) };
  const open = await notifyReferralActivity(env, { code: 'ab3defgh', step: 'link_open' });
  const pay = await notifyReferralActivity(env, { code: 'AB3DEFGH', step: 'checkout_open' });
  const bad = await notifyReferralActivity(env, { code: 'AB3DEFGH', step: 'pending', live: false, event: 'code_issued' });
  assert.equal(open.ok, true);
  assert.equal(pay.ok, true);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'step_unknown');
  const notices = events.filter((e) => e.rpc === 'notify');
  assert.equal(notices.length, 2);
  assert.deepEqual(notices[0], { rpc: 'notify', domain: 'kide.us', code: 'AB3DEFGH', step: 'link_open' });
  assert.deepEqual(notices[1], { rpc: 'notify', domain: 'kide.us', code: 'AB3DEFGH', step: 'checkout_open' });
  assert.equal(JSON.stringify(notices).includes('code_issued'), false);
  assert.equal(JSON.stringify(notices).includes('"live"'), false);
});

await t('concurrent issue and notify hit the hub twice and write no D1 cash row', async () => {
  const events = [];
  const db = memoryDbSync();
  let inflight = 0;
  let peak = 0;
  const hub = cashHub({ events });
  hub.issueCashReferralCode = async (input) => {
    inflight += 1;
    peak = Math.max(peak, inflight);
    events.push({ rpc: 'issue', ...input });
    await new Promise((r) => setTimeout(r, 20));
    inflight -= 1;
    return { ok: true, code: 'AB3DEFGH', link: 'https://kide.us/?ref=AB3DEFGH', rewardLabel: '$5 for you' };
  };
  const env = { DB: db, PORTFOLIO_BILLING_SERVICE: hub };
  const [a, b] = await Promise.all([
    issueShareCode(env, { email: 'a@example.com' }),
    issueShareCode(env, { email: 'a@example.com' }),
  ]);
  assert.equal(a.code, b.code);
  assert.equal(events.filter((e) => e.rpc === 'issue').length, 2);
  assert.ok(peak >= 2, 'both RPCs were in flight');
  const [n1, n2] = await Promise.all([
    notifyReferralActivity(env, { code: 'AB3DEFGH', step: 'link_open' }),
    notifyReferralActivity(env, { code: 'AB3DEFGH', step: 'link_open' }),
  ]);
  assert.equal(n1.ok && n2.ok, true);
  assert.equal(db.names().some((n) => n.startsWith('kide_referral_')), false);
});

await t('mismatch, timeout, and program_disabled fail closed', async () => {
  assert.deepEqual(closedCash().pendingCents, 0);
  const disabled = {
    async issueCashReferralCode() { return { ok: false, reason: 'program_disabled' }; },
    async getCashReferralStatus() { return { ok: false, reason: 'program_disabled' }; },
  };
  assert.equal(await issueShareCode({ PORTFOLIO_BILLING_SERVICE: disabled }, { email: 'a@example.com' }), null);
  assert.equal(await shareStatus({ PORTFOLIO_BILLING_SERVICE: disabled }, { email: 'a@example.com' }), null);
  const slow = {
    async issueCashReferralCode() { return new Promise(() => {}); },
  };
  assert.equal(await issueShareCode({ PORTFOLIO_BILLING_SERVICE: slow }, { email: 'a@example.com' }), null);
  assert.equal(await issueShareCode({}, { email: 'a@example.com' }), null);
  assert.equal(await notifyReferralActivity({}, { code: 'AB3DEFGH', step: 'link_open' }).then((r) => r.reason), 'no_hub');
});

await t('getCredits, cookies, and sourceRef alone do not credit cash', async () => {
  const db = memoryDbSync();
  const events = [];
  const env = {
    DB: db,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_BILLING_SERVICE: {
      ...cashHub({ events }),
      async getCredits() {
        return {
          ok: true,
          purchases: [{
            domain: 'kide.us',
            offeringId: 'family_unlock',
            priceId: STRIPE_PRICE_ID,
            sourceRef: 'cs_test_source_ref',
            status: 'paid',
            paidAt: Date.parse('2026-11-05T12:00:00Z'),
            metadata: { custom_ref: 'AB3DEFGH' },
          }],
        };
      },
    },
  };
  await noteFamilyUnlock(env, req('/'), 'b@example.com', await env.PORTFOLIO_BILLING_SERVICE.getCredits(), Date.now());
  const paid = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    cookie: 'kide_ref=AB3DEFGH',
    body: { email: 'b@example.com' },
  }), env, { now: Date.now() });
  assert.equal((await paid.json()).unlocked, true);
  assert.equal(db.names().some((n) => n.startsWith('kide_referral_')), false);
  assert.equal(events.some((e) => e.rpc === 'notify' && e.step === 'pending'), false);
  env.PORTFOLIO_BILLING_SERVICE.getCredits = async () => ({
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', sourceRef: 'cs_test_source_ref', status: 'refunded' }],
  });
  const back = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST',
    body: { email: 'b@example.com' },
  }), env, { now: Date.now() + 1 });
  assert.equal((await back.json()).unlocked, false);
  assert.equal(events.some((e) => e.event === 'reversed'), false);
});

await t('cross-parent: session A cannot mint or read B', async () => {
  const events = [];
  const db = memoryDbSync();
  const a = await parentIdFor('email', 'a@example.com');
  const env = {
    DB: db,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_MESSAGING_SERVICE: messaging('a@example.com'),
    PORTFOLIO_BILLING_SERVICE: cashHub({ events, code: 'AAAAAAAA' }),
  };
  await setUnlock(env, a, 'cs_a');
  const mine = await handleEarnings(req('/api/parent/earnings', { cookie: 'session=1' }), env);
  const shown = await mine.json();
  assert.equal(mine.status, 200);
  assert.equal(shown.link, 'https://kide.us/?ref=AAAAAAAA');
  assert.equal(shown.pendingCents, 0);
  assert.equal(shown.closed, true);
  assert.ok(events.every((e) => !e.email || e.email === 'a@example.com'));

  env.PORTFOLIO_MESSAGING_SERVICE = messaging('b@example.com');
  const other = await handleUnlock(req('/api/unlock/referral', {
    method: 'POST',
    cookie: 'session=1',
    body: { email: 'a@example.com' },
  }), env);
  assert.equal(other.status, 403);
  assert.equal(events.filter((e) => e.rpc === 'issue' && e.email === 'b@example.com').length, 0);
  assert.equal(events.filter((e) => e.rpc === 'issue' && e.email === 'a@example.com').length, 1);

  const stranger = await handleEarnings(req('/api/parent/earnings'), { DB: db, PORTFOLIO_BILLING_SERVICE: cashHub({ events }) });
  const out = await stranger.json();
  assert.equal(out.signedIn, false);
  assert.equal(out.pendingCents, 0);
});

await t('/r/<code> asks getCashReferrerPublic and notifies link_open', async () => {
  const events = [];
  const env = { PORTFOLIO_BILLING_SERVICE: cashHub({ events, code: 'AB3DEFGH' }) };
  const res = await handleRefLanding(req('/r/ab3defgh'), env, 'ab3defgh');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://kide.us/?ref=AB3DEFGH');
  assert.match(res.headers.get('set-cookie') || '', /kide_ref=AB3DEFGH/);
  assert.deepEqual(events.find((e) => e.rpc === 'public'), { rpc: 'public', domain: 'kide.us', code: 'AB3DEFGH' });
  assert.deepEqual(events.find((e) => e.rpc === 'notify'), { rpc: 'notify', domain: 'kide.us', code: 'AB3DEFGH', step: 'link_open' });
  const missing = await handleReferralHttp(req('/r/ZZZZZZZZ'), env);
  assert.equal(missing.status, 404);
  const junk = await handleReferralHttp(req('/r/<script>'), env);
  assert.equal(junk.status, 404);
  const down = await handleRefLanding(req('/r/AB3DEFGH'), {
    PORTFOLIO_BILLING_SERVICE: { async getCashReferrerPublic() { throw new Error('down'); } },
  }, 'AB3DEFGH');
  assert.equal(down.status, 503);
});

await t('/parent/earnings uses the session email and stays closed on hub $5', async () => {
  const events = [];
  const db = memoryDbSync();
  const email = 'a@example.com';
  const id = await parentIdFor('email', email);
  const env = {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: messaging(email),
    PORTFOLIO_BILLING_SERVICE: cashHub({ events }),
  };
  await setUnlock(env, id, 'family_unlock');
  const first = await handleEarnings(req('/api/parent/earnings', { cookie: 'session=1' }), env);
  const opened = await first.json();
  assert.equal(first.status, 200);
  assert.equal(opened.signedIn, true);
  assert.equal(opened.closed, true);
  assert.equal(opened.link, 'https://kide.us/?ref=AB3DEFGH');
  assert.equal(opened.pendingCents, 0);
  assert.equal(opened.availableCents, 0);
  assert.equal(opened.paidCents, 0);
  assert.equal(opened.openSendCents, 0);
  assert.equal(opened.message, CASH_CLOSED);
  assert.equal(readable(opened.reward), true);
  assert.equal(readable(opened.message), true);
  assert.equal(readable(EARNINGS_COPY.locked), true);
  assert.equal(readable(SHARE_REWARD), true);
  const phoneOnly = await handleEarnings(req('/api/parent/earnings', { cookie: 'session=1' }), {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: { async currentSession() { return { ok: true, phone: '+15555550100' }; } },
    PORTFOLIO_BILLING_SERVICE: cashHub({ events }),
  });
  const phoneView = await phoneOnly.json();
  assert.equal(phoneView.pendingCents, 0);
  assert.equal(phoneView.link, null);
  assert.equal(phoneView.message, EARNINGS_COPY.needAccount);
  const html = readFileSync('public/parent/earnings/index.html', 'utf8');
  assert.match(html, />Pending</);
  assert.match(html, />Closed</);
  assert.match(html, />Paid</);
  assert.match(html, /Cash is not open yet/);
  assert.match(html, /We do not send it yet/);
  assert.match(html, /data-own-price>\$6</);
  assert.match(html, /data-own-price>\$50</);
  assert.doesNotMatch(html, />Available</);
  assert.doesNotMatch(html, /Ready, not sent|Only after we pay it/);
  assert.doesNotMatch(html, /waits 14 days|Waiting 14 days/);
  assert.doesNotMatch(html, /we send it|Already sent|ready to send/i);
  assert.doesNotMatch(html, /stripe|ledger|webhook|operator|queue|connect/i);
  const home = readFileSync('index.html', 'utf8');
  assert.doesNotMatch(home, /Payouts go to|You're all set|so your payouts reach you/);
  assert.match(home, /Your email for this share link/);
  assert.match(home, /We do not send it yet/);
  assert.equal(readable(CLAIM_SAVED), true);
  const js = readFileSync('public/parent/earnings/earnings.js', 'utf8');
  assert.doesNotMatch(js, /stripe|ledger|webhook|operator/i);
  const apply = readFileSync('src/referral/apply.js', 'utf8');
  assert.doesNotMatch(apply, /from "\.\/ledger\.js"|recordClearedPurchase|earningsFor|issueCode\(/);
  assert.match(apply, /step: link_open\|checkout_open/);
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  assert.doesNotMatch(worker, /issueCashReferralCode\(|notifyReferralActivity\(|getCashReferralStatus\(/);
  assert.match(readFileSync('tools/platform-gate/VERSION', 'utf8'), /ab09c0c\+claims-fix/);
  assert.match(readFileSync('package.json', 'utf8'), /tools\/platform-gate\/preflight\.mjs/);
  assert.match(readFileSync('scripts/gate-preflight.mjs', 'utf8'), /tool":"missing"/);
  assert.match(readFileSync('scripts/gate-preflight.mjs', 'utf8'), /process\.exit\(2\)/);
});

console.log('\nauthenticated Worker + mobile earnings/share journeys');

async function workerAndMobile() {
  const events = [];
  const db = memoryDbSync();
  const email = 'a@example.com';
  const id = await parentIdFor('email', email);
  const env = {
    DB: db,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_MESSAGING_SERVICE: messaging(email),
    PORTFOLIO_BILLING_SERVICE: {
      ...cashHub({ events }),
      async getCredits() {
        return { ok: true, purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', status: 'paid', sourceRef: 'cs_test_a' }] };
      },
    },
  };
  await setUnlock(env, id, 'cs_test_a');

  const html = readFileSync('public/parent/earnings/index.html', 'utf8');
  const pageJs = readFileSync('public/parent/earnings/earnings.js', 'utf8');
  const css = readFileSync('public/mobile.css', 'utf8');
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, 'http://127.0.0.1');
    const headers = {};
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    let raw = '';
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      raw = await new Promise((resolve) => {
        const chunks = [];
        incoming.on('data', (c) => chunks.push(c));
        incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
    }
    const request = new Request(url, {
      method: incoming.method,
      headers,
      body: raw || undefined,
    });
    let response;
    if (url.pathname.startsWith('/api/parent/earnings')) response = await handleEarnings(request, env);
    else if (url.pathname.startsWith('/api/unlock/')) response = await handleUnlock(request, env);
    else if (url.pathname.startsWith('/r/')) response = await handleReferralHttp(request, env);
    else if (url.pathname === '/parent/earnings/' || url.pathname === '/parent/earnings') {
      response = new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } else if (url.pathname === '/parent/earnings/earnings.js') {
      response = new Response(pageJs, { headers: { 'content-type': 'text/javascript' } });
    } else if (url.pathname === '/mobile.css') {
      response = new Response(css, { headers: { 'content-type': 'text/css' } });
    } else {
      response = new Response('not found', { status: 404 });
    }
    const outHeaders = {};
    response.headers.forEach((value, key) => { outHeaders[key] = value; });
    outgoing.writeHead(response.status, outHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const base = `http://127.0.0.1:${port}`;

  const earn = await fetch(`${base}/api/parent/earnings`, { headers: { cookie: 'session=1' } });
  const earnJson = await earn.json();
  assert.equal(earn.status, 200);
  assert.equal(earnJson.closed, true);
  assert.equal(earnJson.pendingCents, 0);
  assert.equal(earnJson.link, 'https://kide.us/?ref=AB3DEFGH');

  const share = await fetch(`${base}/api/unlock/referral`, {
    method: 'POST',
    headers: { cookie: 'session=1', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'b@example.com' }),
  });
  const shareJson = await share.json();
  assert.equal(share.status, 200);
  assert.equal(shareJson.earnedCents, 0);
  assert.equal(shareJson.link, 'https://kide.us/?ref=AB3DEFGH');
  assert.ok(events.filter((e) => e.rpc === 'issue').every((e) => e.email === email));

  const land = await fetch(`${base}/r/AB3DEFGH`, { redirect: 'manual' });
  assert.equal(land.status, 302);
  assert.ok(events.some((e) => e.rpc === 'notify' && e.step === 'link_open'));

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    server.close();
    console.log('  SKIP mobile Worker: playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    server.close();
    console.log('  SKIP mobile Worker: ' + String(e.message || e).split('\n')[0]);
    return;
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  try {
    await page.context().addCookies([{ name: 'session', value: '1', url: base }]);
    await page.goto(`${base}/parent/earnings/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('pending').textContent === '$0');
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
        pending: document.getElementById('pending').textContent,
        url: document.getElementById('shareUrl').textContent,
        small,
      };
    });
    assert.equal(seen.pending, '$0');
    assert.match(seen.text, /Cash is not open yet/);
    assert.match(seen.text, /\$6/);
    assert.match(seen.text, /\$50/);
    assert.doesNotMatch(seen.text, /Available|Ready, not sent|Only after we pay it|Payouts go to/i);
    assert.match(seen.url, /https:\/\/kide\.us\/\?ref=AB3DEFGH/);
    assert.equal(seen.share, true);
    assert.equal(seen.overflow, 0, 'horizontal overflow ' + seen.overflow);
    assert.deepEqual(seen.small, []);
    await page.setViewportSize({ width: 1280, height: 800 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(wide, 0, 'desktop overflow ' + wide);
    console.log('  ok   authenticated Worker earnings at 320px and 1280px');
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

await t('authenticated local Worker covers earnings and share', workerAndMobile);

async function claimPageJourney() {
  const claim = 'a'.repeat(24);
  const home = readFileSync('index.html', 'utf8')
    .replace('id="claimBar" hidden', `id="claimBar" data-code="AB3DEFGH" data-claim="${claim}"`)
    .replace('id="claimReward"></span>', `id="claimReward">${SHARE_REWARD}</span>`)
    .replace('id="claimName">Welcome', 'id="claimName">Welcome Austin');
  assert.match(home, /id="claimBar" data-code="AB3DEFGH"/);
  assert.doesNotMatch(home, /id="claimBar" hidden/);
  let claimOk = true;
  const env = {
    PORTFOLIO_BILLING_SERVICE: {
      async claimCashReferrer(input) {
        if (!claimOk) return { ok: false, reason: 'not_claimable' };
        return { ok: true, rewardLabel: '$5 for you when a family you shared with buys family play', link: `https://kide.us/?ref=${input.code}` };
      },
    },
  };
  const css = readFileSync('public/mobile.css', 'utf8');
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, 'http://127.0.0.1');
    const headers = {};
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    let raw = '';
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      raw = await new Promise((resolve) => {
        const chunks = [];
        incoming.on('data', (c) => chunks.push(c));
        incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
    }
    const request = new Request(url, { method: incoming.method, headers, body: raw || undefined });
    let response;
    if (url.pathname === '/api/ref/claim') response = await handleRefClaim(request, env);
    else if (url.pathname === '/' || url.pathname === '/index.html') {
      response = new Response(home, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } else if (url.pathname === '/mobile.css') {
      response = new Response(css, { headers: { 'content-type': 'text/css' } });
    } else {
      response = new Response('not found', { status: 404 });
    }
    const outHeaders = {};
    response.headers.forEach((value, key) => { outHeaders[key] = value; });
    outgoing.writeHead(response.status, outHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const base = `http://127.0.0.1:${port}`;
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    server.close();
    console.log('  SKIP claim page: playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    server.close();
    console.log('  SKIP claim page: ' + String(e.message || e).split('\n')[0]);
    return;
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${base}/?ref=AB3DEFGH&claim=${claim}`, { waitUntil: 'networkidle' });
    const before = await page.evaluate(() => ({
      bar: document.getElementById('claimBar').hidden,
      reward: document.getElementById('claimReward').innerText,
      rewardH: document.getElementById('claimReward').getBoundingClientRect().height,
      done: document.getElementById('claimDone').hidden,
      text: document.getElementById('claimBar').innerText,
    }));
    assert.equal(before.bar, false);
    assert.equal(before.done, true);
    assert.ok(before.rewardH > 0, 'terms must be on screen before claim');
    assert.match(before.reward, /\$6/);
    assert.match(before.reward, /\$50/);
    assert.match(before.reward, /We do not send it yet/);
    await page.click('#claimOpen');
    await page.fill('#claimEmail', 'austin@example.com');
    await page.click('#claimForm button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('claimDone').hidden === false);
    const after = await page.evaluate(() => {
      const reward = document.getElementById('claimReward');
      const r = reward.getBoundingClientRect();
      return {
        start: document.getElementById('claimStart').hidden,
        done: document.getElementById('claimDone').hidden,
        doneText: document.getElementById('claimDoneText').innerText,
        reward: reward.innerText,
        rewardVisible: r.height > 0 && r.width > 0,
        bar: document.getElementById('claimBar').innerText,
      };
    });
    assert.equal(after.start, true);
    assert.equal(after.done, false);
    assert.equal(after.rewardVisible, true, 'claim success must keep the $6/$50 terms on screen');
    assert.match(after.reward, /\$6/);
    assert.match(after.reward, /\$50/);
    assert.match(after.reward, /We do not send it yet/);
    assert.match(after.doneText, /austin@example\.com/);
    assert.match(after.doneText, /We do not send it yet/);
    assert.doesNotMatch(after.bar, /Payouts go to|You're all set|Ready, not sent/i);
    assert.doesNotMatch(after.doneText, /Payouts go to|You're all set/);

    claimOk = false;
    await page.goto(`${base}/?ref=AB3DEFGH&claim=${claim}`, { waitUntil: 'networkidle' });
    await page.click('#claimOpen');
    await page.fill('#claimEmail', 'austin@example.com');
    await page.click('#claimForm button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('claimMsg').textContent.length > 0);
    const failed = await page.evaluate(() => ({
      done: document.getElementById('claimDone').hidden,
      start: document.getElementById('claimStart').hidden,
      reward: document.getElementById('claimReward').innerText,
      rewardH: document.getElementById('claimReward').getBoundingClientRect().height,
      msg: document.getElementById('claimMsg').innerText,
    }));
    assert.equal(failed.done, true, 'a refused claim must not show success');
    assert.equal(failed.start, false);
    assert.ok(failed.rewardH > 0);
    assert.match(failed.reward, /\$6/);
    assert.match(failed.reward, /\$50/);
    assert.match(failed.msg, /already claimed|didn't save/i);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

await t('claim success keeps $6/$50 terms and does not promise a payout', claimPageJourney);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
