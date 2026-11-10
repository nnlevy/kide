// Family-play funnel: tap on a share link → play → gate → offer → checkout → paid.
// Runs the real modules against SQLite through a small D1 shim. No network.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  BROWSER_STEPS, SERVER_STEPS, deviceClass, handleFunnel, isPreviewFetch,
  qaFromRequest, recordLinkOpen, recordStep, resetForTests, withQaCookie,
} from './src/funnel/funnel.js';
import { RECORDED_REFERRAL } from './src/referral/invite.js';
import { handleUnlock } from './src/unlock/handler.js';
import { STRIPE_PRICE_ID } from './src/unlock/config.js';

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { sqlite, DB: { prepare: (sql) => stmt(sql) } };
}

function memoryKv() {
  const m = new Map();
  const puts = [];
  return {
    puts,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, opts) { m.set(k, String(v)); puts.push({ k, opts: opts === undefined ? null : opts }); },
    async delete(k) { m.delete(k); },
  };
}

function fresh(extra = {}) {
  resetForTests();
  const { sqlite, DB } = d1();
  const alerts = [];
  const hub = {
    async notifyReferralActivity(input) { alerts.push(input); return { ok: true }; },
    async createCheckout() { return { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_fake' }; },
    async getCredits() { return { ok: true, purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', priceId: STRIPE_PRICE_ID, status: 'paid' }] }; },
    ...extra,
  };
  const env = { DB, KIDE_LEADS: memoryKv(), PORTFOLIO_BILLING_SERVICE: hub };
  const rows = () => {
    const has = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'kide_funnel_events'").get();
    return has ? sqlite.prepare('SELECT step, ref, detail, qa, alerted FROM kide_funnel_events ORDER BY id').all() : [];
  };
  return { sqlite, env, alerts, rows };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IMESSAGE_PREVIEW = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0';
const WHATSAPP_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.20.78';
const WHATSAPP_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 WhatsApp/2.24.1.74';
const WHATSAPP_PREVIEW = 'WhatsApp/2.23.20.0 A';
const PINTEREST_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Pinterest/iOS';
const PINTEREST_BOT = 'Mozilla/5.0 (compatible; Pinterestbot/1.0; +https://www.pinterest.com/bot.html)';
const BINGBOT = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
const APPLEBOT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NOT_A_CRAWLER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Preview/1.0';
const CUBOT_PHONE = 'Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.105 Mobile Safari/537.36';
const BING_PREVIEW = 'BingPreview/1.0b';
const META_EXTERNAL_AGENT = 'meta-externalagent/1.1';
const CODE = 'DXGN9HC6';
const open = (url, ua = IPHONE) => new Request(url, { headers: { 'user-agent': ua } });
const call = (path, body, cookie) => new Request('https://kide.us' + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});

console.log('\na row is a step and a time, never a person');

await t('the table has no column that could identify a visitor', async () => {
  const { sqlite, env } = fresh();
  await recordStep(env, { step: 'paid', ref: CODE, now: Date.parse('2026-11-04T02:00:00Z') });
  const cols = sqlite.prepare('PRAGMA table_info(kide_funnel_events)').all().map((c) => c.name).sort();
  assert.deepEqual(cols, ['alerted', 'day', 'detail', 'id', 'qa', 'ref', 'step', 'ts']);
});

await t('unknown steps are not stored, and a detail outside its list is blank', async () => {
  const { env, rows } = fresh();
  assert.equal(await recordStep(env, { step: 'child_said', detail: 'red' }), 0);
  await recordStep(env, { step: 'link_open', ref: CODE, detail: 'Mozilla/5.0 iPhone' });
  await recordStep(env, { step: 'link_open', ref: 'not-a-code', detail: 'phone' });
  assert.deepEqual(rows().map((r) => [r.step, r.ref, r.detail]), [['link_open', CODE, ''], ['link_open', '', 'phone']]);
});

await t('a missing database stores nothing and never throws', async () => {
  resetForTests();
  assert.equal(await recordStep({}, { step: 'paid' }), 0);
  assert.equal(await recordStep({ DB: { prepare() { throw new Error('down'); } } }, { step: 'paid' }), 0);
});

await t('device class is coarse: phone, tablet or computer', () => {
  assert.equal(deviceClass(IPHONE), 'phone');
  assert.equal(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'computer');
  assert.equal(isPreviewFetch(IMESSAGE_PREVIEW), true);
  assert.equal(isPreviewFetch(IPHONE), false);
});

console.log('\na tap on a share link is counted, and Nir hears about it');

await t('a person opening the link is one row and one alert', async () => {
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.deepEqual(rows(), [{ step: 'link_open', ref: CODE, detail: 'phone', qa: 0, alerted: 1 }]);
  assert.equal(alerts.length, 1);
  assert.deepEqual(
    [alerts[0].domain, alerts[0].code, alerts[0].step, alerts[0].device, alerts[0].opens, alerts[0].checkouts, alerts[0].paid],
    ['kide.us', CODE, 'link_open', 'phone', 1, 0, 0],
  );
  assert(!('ua' in alerts[0]) && !('ip' in alerts[0]), 'the alert carries something about the visitor');
});

await t('reloading within ten minutes is counted but does not alert again', async () => {
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T02:14:00Z');
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at + 60_000);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at + 11 * 60_000);
  assert.equal(rows().length, 3);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].opens, 3);
});

await t('a message app drawing the preview card is counted apart and never alerts', async () => {
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, IMESSAGE_PREVIEW), env, null, Date.now());
  assert.deepEqual(rows().map((r) => [r.step, r.detail, r.alerted]), [['link_preview', 'preview', 0]]);
  assert.equal(alerts.length, 0);
});

await t('a WhatsApp or Pinterest in-app tap is a real open; only the crawler is a preview', async () => {
  assert.equal(isPreviewFetch(WHATSAPP_BROWSER), false);
  assert.equal(isPreviewFetch(WHATSAPP_ANDROID), false);
  assert.equal(isPreviewFetch(WHATSAPP_PREVIEW), true);
  assert.equal(isPreviewFetch(PINTEREST_BROWSER), false);
  assert.equal(isPreviewFetch(PINTEREST_BOT), true);
  assert.equal(isPreviewFetch('Pinterest/0.2 (+http://www.pinterest.com/)'), true);
  assert.equal(isPreviewFetch(NOT_A_CRAWLER), false);
  assert.equal(deviceClass(WHATSAPP_BROWSER), 'phone');
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T02:14:00Z');
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, WHATSAPP_BROWSER), env, null, at);
  assert.equal(rows()[0].step, 'link_open');
  assert.equal(rows()[0].detail, 'phone');
  assert.equal(alerts.length, 1);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, WHATSAPP_PREVIEW), env, null, at + 60 * 60_000);
  assert.equal(rows()[1].step, 'link_preview');
  assert.equal(alerts.length, 1);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, PINTEREST_BROWSER), env, null, at + 2 * 60 * 60_000);
  assert.equal(rows()[2].step, 'link_open');
  assert.equal(alerts.length, 2);
});

await t('a CUBOT phone is a real open and can email the owner', async () => {
  assert.equal(isPreviewFetch(CUBOT_PHONE), false);
  assert.equal(deviceClass(CUBOT_PHONE), 'phone');
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, CUBOT_PHONE), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.deepEqual(rows().map((r) => [r.step, r.detail, r.alerted]), [['link_open', 'phone', 1]]);
  assert.equal(alerts.length, 1);
});

await t('BingPreview/1.0b is a preview and does not email the owner', async () => {
  assert.equal(isPreviewFetch(BING_PREVIEW), true);
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, BING_PREVIEW), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.deepEqual(rows().map((r) => [r.step, r.detail, r.alerted]), [['link_preview', 'preview', 0]]);
  assert.equal(alerts.length, 0);
});

await t('meta-externalagent is a preview even when the word crawler is absent', async () => {
  assert.equal(/crawler/i.test(META_EXTERNAL_AGENT), false);
  assert.equal(isPreviewFetch(META_EXTERNAL_AGENT), true);
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, META_EXTERNAL_AGENT), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.deepEqual(rows().map((r) => [r.step, r.detail, r.alerted]), [['link_preview', 'preview', 0]]);
  assert.equal(alerts.length, 0);
});

await t('a WhatsApp in-app browser is a real open and can email the owner', async () => {
  assert.equal(isPreviewFetch(WHATSAPP_BROWSER), false);
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, WHATSAPP_BROWSER), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.equal(rows()[0].step, 'link_open');
  assert.equal(rows()[0].detail, 'phone');
  assert.equal(alerts.length, 1);
});

await t('a Pinterest in-app browser is a real open and can email the owner', async () => {
  assert.equal(isPreviewFetch(PINTEREST_BROWSER), false);
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, PINTEREST_BROWSER), env, null, Date.parse('2026-11-04T02:14:00Z'));
  assert.equal(rows()[0].step, 'link_open');
  assert.equal(rows()[0].detail, 'phone');
  assert.equal(alerts.length, 1);
});

await t('crawler user agents, including suffix bots, are previews and do not alert', async () => {
  assert.equal(isPreviewFetch(BINGBOT), true);
  assert.equal(isPreviewFetch(APPLEBOT), true);
  assert.equal(isPreviewFetch(GOOGLEBOT), true);
  assert.equal(isPreviewFetch('Mozilla/5.0 (compatible; Somebot/1.2; +https://example.com/bot)'), true);
  assert.equal(isPreviewFetch('Mozilla/5.0 (compatible; Applebot)'), true);
  assert.equal(isPreviewFetch(WHATSAPP_BROWSER), false);
  assert.equal(isPreviewFetch(PINTEREST_BROWSER), false);
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T02:14:00Z');
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, BINGBOT), env, null, at);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`, APPLEBOT), env, null, at + 60_000);
  assert.deepEqual(rows().map((r) => [r.step, r.detail, r.alerted]), [
    ['link_preview', 'preview', 0],
    ['link_preview', 'preview', 0],
  ]);
  assert.equal(alerts.length, 0);
});

await t('an alert is marked only after the hub accepts it', async () => {
  let mode = 'no';
  const { env, alerts, rows } = fresh({
    async notifyReferralActivity(input) {
      if (mode === 'no') return { ok: false };
      if (mode === 'throw') throw new Error('down');
      alerts.push(input);
      return { ok: true };
    },
  });
  const at = Date.parse('2026-11-04T02:14:00Z');
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at);
  assert.equal(rows()[0].alerted, 0);
  assert.equal(alerts.length, 0);
  mode = 'throw';
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at + 1000);
  assert.equal(rows()[1].alerted, 0);
  assert.equal(alerts.length, 0);
  mode = 'ok';
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at + 2000);
  assert.equal(rows()[2].alerted, 1);
  assert.equal(alerts.length, 1);
});

await t('the ten-minute quiet period and the daily cap cover checkout too', async () => {
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T02:14:00Z');
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at);
  const early = await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com' }, `kide_ref=${CODE}`), env, { now: at + 60_000 });
  assert.equal(early.status, 200);
  assert.equal(alerts.length, 1);
  assert.deepEqual(rows().map((r) => [r.step, r.alerted]), [['link_open', 1], ['checkout_open', 0]]);
  const later = await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com' }, `kide_ref=${CODE}`), env, { now: at + 11 * 60_000 });
  assert.equal(later.status, 200);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].step, 'checkout_open');

  const capped = fresh();
  let when = Date.parse('2026-11-04T00:00:00Z');
  for (let i = 0; i < 20; i++) {
    await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), capped.env, null, when);
    when += 11 * 60_000;
  }
  assert.equal(capped.alerts.length, 20);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), capped.env, null, when);
  await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com' }, `kide_ref=${CODE}`), capped.env, { now: when });
  assert.equal(capped.alerts.length, 20);
});

await t('a QA open is marked and never alerts; no code means no row', async () => {
  const { env, alerts, rows } = fresh();
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}&kide_qa=1`), env, null, Date.now());
  await recordLinkOpen(open('https://kide.us/'), env, null, Date.now());
  assert.deepEqual(rows().map((r) => [r.step, r.qa]), [['link_open', 1]]);
  assert.equal(alerts.length, 0);
});

await t('the alert waits on ctx.waitUntil when the worker gives one', async () => {
  const { env, alerts } = fresh();
  const waits = [];
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, { waitUntil: (p) => waits.push(p) }, Date.now());
  assert.equal(waits.length, 1);
  await waits[0];
  assert.equal(alerts.length, 1);
});

console.log('\nbrowser steps come only from the grown-up pages');

const post = (body, cookie = '') => new Request('https://kide.us/api/funnel', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

await t('a browser step takes the share code from the cookie, never the body', async () => {
  const { env, rows } = fresh();
  const res = await handleFunnel(post({ step: 'unlock_view', detail: 'goodnight', ref: '23456789', qa: true }, `kide_ref=${CODE}`), env);
  assert.equal(res.status, 200);
  assert.deepEqual(rows(), [{ step: 'unlock_view', ref: CODE, detail: 'goodnight', qa: 0, alerted: 0 }]);
  assert.equal(qaFromRequest(new Request('https://kide.us/api/funnel?kide_qa=1')), true);
  assert.equal(qaFromRequest(new Request('https://kide.us/api/funnel')), false);
  await handleFunnel(post({ step: 'check_pass', qa: false }, 'kide_qa=1'), env);
  assert.equal(rows()[1].qa, 1);
  await handleFunnel(new Request('https://kide.us/api/funnel?kide_qa=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step: 'check_fail', qa: false }),
  }), env);
  assert.equal(rows()[2].qa, 1);
  const wrapped = withQaCookie(new Request('https://kide.us/?kide_qa=1'), new Response('ok'));
  assert.match(wrapped.headers.get('set-cookie') || '', /^kide_qa=1; HttpOnly; Secure; SameSite=Lax; Path=\/$/);
  assert.equal(withQaCookie(new Request('https://kide.us/'), new Response('ok')).headers.get('set-cookie'), null);
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  assert.match(worker, /withQaCookie\(request, withRefCookie\(request,/);
});

await t('a checkout qa flag in the body or the kide_qa cookie does not drop the row', async () => {
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T04:00:00Z');
  const forged = await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com', qa: true }, `kide_ref=${CODE}`), env, { now: at });
  assert.equal(forged.status, 200);
  assert.equal(rows()[0].qa, 0);
  assert.equal(rows()[0].alerted, 1);
  assert.equal(alerts.length, 1);
  await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com', qa: false }, `kide_ref=${CODE}; kide_qa=1`), env, { now: at + 60 * 60_000 });
  assert.equal(rows()[1].qa, 0);
  assert.equal(rows()[1].step, 'checkout_open');
  assert.equal(rows()[1].alerted, 1);
  assert.equal(alerts.length, 2);
});

await t('server-only steps, unknown steps and big bodies are refused', async () => {
  const { env, rows } = fresh();
  assert.equal((await handleFunnel(post({ step: 'paid' }), env)).status, 400);
  assert.equal((await handleFunnel(post({ step: 'link_open' }), env)).status, 400);
  assert.equal((await handleFunnel(post({ step: 'gate_go' }), env)).status, 400);
  assert.equal((await handleFunnel(post('x'.repeat(600)), env)).status, 400);
  assert.equal((await handleFunnel(new Request('https://kide.us/api/funnel'), env)).status, 405);
  assert.equal(rows().length, 0);
});

await t('Pip\'s game screens send no funnel step', () => {
  for (const file of ['public/play/index.html', 'public/unlock/timer.js', 'public/words/index.html']) {
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    assert(!/\/api\/funnel/.test(text), `${file} sends funnel steps from a child's screen`);
  }
  const timer = readFileSync('public/unlock/timer.js', 'utf8');
  assert.match(timer, /location\.href = "\/unlock\/\?from=" \+ from/);
});

await t('every browser step the pages send is one the server accepts', () => {
  const pages = readFileSync('public/unlock/parent.js', 'utf8') + readFileSync('index.html', 'utf8');
  const sent = new Set([...pages.matchAll(/funnel\("([a-z_]+)"/g), ...pages.matchAll(/step: "([a-z_]+)"/g)].map((m) => m[1]));
  assert(sent.size >= 5, 'the pages no longer send funnel steps this suite can see');
  for (const step of sent) assert(step in BROWSER_STEPS, `the page sends ${step}, which the server refuses`);
  for (const step of Object.keys(BROWSER_STEPS)) assert(sent.has(step), `nothing sends ${step}`);
  for (const step of Object.keys(SERVER_STEPS)) assert(!(step in BROWSER_STEPS), `${step} is both`);
});

console.log('\ncheckout, payment and the free-play meter feed the same funnel');

await t('a checkout from a share link is counted and alerts', async () => {
  const { env, alerts, rows } = fresh();
  const res = await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com' }, `kide_ref=${CODE}`), env, { now: Date.now() });
  assert.equal(res.status, 200);
  assert.deepEqual(rows().map((r) => [r.step, r.ref, r.alerted]), [['checkout_open', CODE, 1]]);
  assert.equal(alerts[0].step, 'checkout_open');
  assert.equal(alerts[0].checkouts, 1);
});

await t('a failed checkout is counted as a failure, not an open', async () => {
  const { env, alerts, rows } = fresh({ async createCheckout() { throw new Error('hub down'); } });
  const res = await handleUnlock(call('/api/unlock/checkout', { email: 'p@example.com' }, `kide_ref=${CODE}`), env, { now: Date.now() });
  assert.equal(res.status, 503);
  assert.deepEqual(rows().map((r) => r.step), ['checkout_fail']);
  assert.equal(alerts.length, 0);
});

await t('a purchase is counted once, though the success page asks several times', async () => {
  const { env, rows } = fresh();
  for (let i = 0; i < 3; i++) {
    const res = await handleUnlock(call('/api/unlock/confirm', { email: 'p@example.com' }, `kide_ref=${CODE}`), env, { now: Date.now() });
    assert.equal((await res.json()).unlocked, true);
  }
  assert.deepEqual(rows().map((r) => [r.step, r.ref]), [['paid', CODE]]);
  const stored = JSON.stringify(rows());
  assert(!/example\.com/.test(stored), 'the email reached the funnel');
});

await t('only a confirmed purchase is counted, and the same purchase never counts again', async () => {
  let purchases = [{ id: 'pi_old', domain: 'kide.us', offeringId: 'family_unlock', status: 'pending' }];
  const { env, rows } = fresh({ async getCredits() { return { ok: true, purchases }; } });
  const confirm = (now, body = { email: 'p@example.com', qa: true }) =>
    handleUnlock(call('/api/unlock/confirm', body, `kide_ref=${CODE}`), env, { now });
  let res = await confirm(Date.parse('2026-11-04T02:00:00Z'));
  assert.equal((await res.json()).unlocked, false);
  assert.equal(rows().length, 0, 'a pending checkout must not add a paid row');
  purchases = [{ id: 'pi_open', domain: 'kide.us', offeringId: 'family_unlock', status: 'open' }];
  res = await confirm(Date.parse('2026-11-04T02:05:00Z'));
  assert.equal((await res.json()).unlocked, false);
  purchases = [{ domain: 'kide.us', offeringId: 'family_unlock', creditsPurchased: 1 }];
  res = await confirm(Date.parse('2026-11-04T02:06:00Z'));
  assert.equal((await res.json()).unlocked, false);
  assert.equal(rows().length, 0, 'a blank status must not add a paid row');

  purchases = [{ id: 'pi_old', domain: 'kide.us', offeringId: 'family_unlock', status: 'paid' }];
  res = await confirm(Date.parse('2026-11-04T02:10:00Z'));
  assert.equal((await res.json()).unlocked, true);
  res = await confirm(Date.parse('2026-12-01T02:00:00Z'));
  assert.equal((await res.json()).unlocked, true);
  assert.deepEqual(rows().map((r) => [r.step, r.ref, r.qa]), [['paid', CODE, 0]]);
  const paidPuts = () => env.KIDE_LEADS.puts.filter((p) => String(p.k).startsWith('kide:funnel-paid:'));
  assert.equal(paidPuts().length, 1);
  assert.equal(paidPuts()[0].opts, null, 'the purchase marker must not expire');
  assert.match(paidPuts()[0].k, /^kide:funnel-paid:v2:/);

  purchases = [
    { id: 'pi_old', domain: 'kide.us', offeringId: 'family_unlock', status: 'paid' },
    { id: 'pi_new', domain: 'kide.us', offeringId: 'family_unlock', status: 'succeeded' },
  ];
  await confirm(Date.parse('2026-12-02T02:00:00Z'), { email: 'p@example.com' });
  assert.deepEqual(rows().map((r) => r.step), ['paid', 'paid']);
  assert.equal(paidPuts().length, 2);
  for (const put of paidPuts()) assert.equal(put.opts, null);
  assert(!/example\.com/.test(JSON.stringify(rows())), 'the email reached the funnel');
});

await t('a device\'s first play of the day and its used-up day are each counted once', async () => {
  const { env, rows } = fresh({ async getCredits() { return { ok: true, purchases: [] }; } });
  let now = Date.parse('2026-11-04T15:00:00Z');
  let cookie = `kide_ref=${CODE}; kide_qa=1`;
  const tick = async () => {
    const res = await handleUnlock(call('/api/unlock/tick', {}, cookie), env, { now });
    const set = (res.headers.get('set-cookie') || '').split(';')[0];
    if (set.startsWith('kide_device=')) cookie = `${cookie}; ${set}`;
    return res.json();
  };
  let data = await tick();
  for (let i = 0; i < 30 && !data.gated; i++) { now += 15_000; data = await tick(); }
  assert.equal(data.gated, true);
  now += 15_000; await tick();
  assert.deepEqual(rows().map((r) => [r.step, r.ref, r.qa]), [['play_day', CODE, 0], ['gate_day', CODE, 0]]);
});

await t('a purchase with the kide_qa cookie is still counted as paid', async () => {
  const { env, alerts, rows } = fresh();
  const at = Date.parse('2026-11-04T02:14:00Z');
  const res = await handleUnlock(
    call('/api/unlock/confirm', { email: 'p@example.com' }, `kide_ref=${CODE}; kide_qa=1`),
    env,
    { now: at },
  );
  assert.equal((await res.json()).unlocked, true);
  assert.deepEqual(rows().map((r) => [r.step, r.qa, r.ref]), [['paid', 0, CODE]]);
  const paidPuts = env.KIDE_LEADS.puts.filter((p) => String(p.k).startsWith('kide:funnel-paid:'));
  assert.equal(paidPuts.length, 1);
  assert.equal(paidPuts[0].opts, null);
  await recordLinkOpen(open(`https://kide.us/?ref=${CODE}`), env, null, at + 11 * 60_000);
  assert.equal(alerts.at(-1).paid, 1);
  const again = await handleUnlock(
    call('/api/unlock/confirm', { email: 'p@example.com' }, `kide_ref=${CODE}`),
    env,
    { now: at + 12 * 60_000 },
  );
  assert.equal((await again.json()).unlocked, true);
  assert.equal(rows().filter((r) => r.step === 'paid').length, 1);
});

await t('a missed paid insert does not burn the once-only marker', async () => {
  const { env, rows } = fresh();
  const at = Date.parse('2026-11-04T02:10:00Z');
  const confirm = () => handleUnlock(
    call('/api/unlock/confirm', { email: 'p@example.com' }, `kide_ref=${CODE}`),
    env,
    { now: at },
  );
  const paidPuts = () => env.KIDE_LEADS.puts.filter((p) => String(p.k).startsWith('kide:funnel-paid:'));
  const realPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (/insert into kide_funnel_events/i.test(sql)) {
      return { bind() { return { run: async () => { throw new Error('d1 down'); } }; } };
    }
    return realPrepare(sql);
  };
  let res = await confirm();
  assert.equal((await res.json()).unlocked, true);
  assert.equal(rows().filter((r) => r.step === 'paid').length, 0);
  assert.equal(paidPuts().length, 0, 'a failed insert must not write the marker');

  const db = env.DB;
  env.DB = null;
  res = await confirm();
  assert.equal((await res.json()).unlocked, true);
  assert.equal(paidPuts().length, 0, 'a missing database must not write the marker');

  env.DB = db;
  env.DB.prepare = realPrepare;
  resetForTests();
  res = await confirm();
  assert.equal((await res.json()).unlocked, true);
  assert.equal(rows().filter((r) => r.step === 'paid').length, 1);
  assert.equal(paidPuts().length, 1);
  assert.equal(paidPuts()[0].opts, null, 'the purchase marker must not expire');
  assert.match(paidPuts()[0].k, /^kide:funnel-paid:v2:/);
});

console.log('\nthe privacy page says what is counted');

await t('the policy names what is stored, what can be joined, and what is sent on', () => {
  const text = readFileSync('public/privacy/index.html', 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /random device number/);
  assert.match(text, /store the email they gave us against that same device number/);
  assert.match(text, /Counts that carry the same share code can be read together/);
  assert.match(text, /free-play minute meter/);
  assert.match(text, /files a referral credit on a queue/);
  assert.match(text, /sent to our billing service/);
  assert.match(text, /preview card fetched by a message app/);
  assert.match(text, /fetch of that same link by a crawler/);
  assert.match(text, /page for speech-language pathologists/);
  assert.match(text, /card maker/);
  assert.match(text, /Cast Club welcome page/);
  assert.match(text, /this privacy page, the terms, the clinician page, and the Cast Club app do not send these notes/);
  assert.match(text, /together with this phone's device cookie/);
  assert.match(text, /The device cookie lasts one year/);
  assert.match(text, /a cookie with a random device number\. It lasts one year\./);
  assert.match(text, /do not use a parent sign-in for that story/);
  assert.match(text, /stored for 36 hours/);
  assert.match(text, /A new UTC day starts the allowance again/);
  assert.doesNotMatch(text, /a day and a half/);
  assert.match(text, /does not clear the device cookie or that story count/);
  assert.match(text, /That email is not your child's name\. Pip's Cast Club, described below, sends the cast set-up and the taps you pick, and does not send the name/);
  assert.doesNotMatch(text, /this privacy page, the terms, the clinician page, and the card maker/);
  assert.match(text, /session cookie named kide_qa/);
  assert.match(text, /when the address contains kide_qa=1/);
  assert.match(text, /lasts until you close the browser/);
  assert.match(text, /tap on play from the home page/);
  assert.match(text, /grown-up check passed/);
  assert.match(text, /grown-up check missed/);
  assert.match(text, /free-minute gate/);
  assert.match(text, /Pip's goodnight/);
  assert.match(text, /opened directly/);
  assert.match(text, /checkout tapped/);
  assert.match(text, /checkout that did not start/);
  assert.match(text, /checkout left before payment/);
  assert.match(text, /with the step name, phone, tablet, or computer when we know it, the time/);
  assert.match(text, /We don't collect your child's name, age, photo, or location with that email/);
  assert.doesNotMatch(text, /any other information about your child/);
  assert.match(text, /We store the minutes for the UTC day against that device number, and that record does not expire/);
  assert.match(text, /the minutes for the UTC day are also stored against that email, and that record does not expire/);
  assert.match(text, /Those records do not expire/);
  assert.match(text, /the sign-in cookie after a parent signs in, the random device number, a share code/);
  assert.doesNotMatch(text, /the free-play minute count, a share code/);
  assert.match(text, /When you claim a share link, that email is sent to our billing service together with your share code/);
  assert.match(text, /SHA-256 scramble of the receipt email and the purchase id/);
  assert.match(text, /it does not expire/);
  assert.match(text, /https:\/\/riskfreetrial\.org\/api\/analytics/);
  assert.match(text, /scrolled halfway/);
  assert.match(text, /when a link or button is tapped/);
  assert.doesNotMatch(text, /can't be joined|cannot be joined/);
  assert.doesNotMatch(text, /Pip's games send none/);
  assert.doesNotMatch(text, /identify no one/);
  assert.doesNotMatch(text, /used for nothing else/);
  assert.doesNotMatch(text, /shared with anyone/);
  assert.doesNotMatch(text, /thanked|thank-you|thank you/i);
  assert.doesNotMatch(text, /the only cookie this site sets is the short-lived sign-in cookie/);
  const home = readFileSync('index.html', 'utf8');
  assert.match(home, /Your email, so a referral credit can be queued for you/);
  assert.match(home, /Games stay on the device/);
  assert.doesNotMatch(home, /Nothing leaves the device/);
  assert.match(home, /The referral record still waits on a queue\. It is not a payment\./);
  assert.doesNotMatch(home, /for referral credits/);
  assert.doesNotMatch(home, /rewardLabel/);
  assert.doesNotMatch(home, /\$\d/);
  const claimStart = home.slice(home.indexOf('id="claimStart"'), home.indexOf('id="claimDone"'));
  assert.equal(claimStart.includes('claimReward'), false, 'success hides the queue note with the form');
  assert.match(home, /step: "home_cta"/);
  assert.doesNotMatch(home, /payouts reach you/);
  assert.doesNotMatch(home, /Payouts go to/);
  const invite = readFileSync('src/referral/invite.js', 'utf8');
  const parent = readFileSync('public/unlock/parent.js', 'utf8');
  assert.equal(RECORDED_REFERRAL.includes('You earn'), false);
  assert.match(invite, /setText\(RECORDED_REFERRAL\)/);
  assert.doesNotMatch(invite, /You earn/);
  assert.match(parent, /We record a referral when a family buys family play through your link/);
  assert.doesNotMatch(parent, /You earn/);
  assert.doesNotMatch(parent, /data\.reward \+ "\."/);
  const play = readFileSync('public/play/index.html', 'utf8');
  for (const attr of ['property="og:description"', 'name="twitter:description"']) {
    const tag = play.slice(play.indexOf(attr), play.indexOf('>', play.indexOf(attr)));
    assert.match(tag, /Today's play is counted/);
    assert.doesNotMatch(tag, /nothing leaves the device/i);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
