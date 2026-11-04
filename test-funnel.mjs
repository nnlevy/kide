// Family-play funnel: tap on a share link → play → gate → offer → checkout → paid.
// Runs the real modules against SQLite through a small D1 shim. No network.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  BROWSER_STEPS, SERVER_STEPS, deviceClass, handleFunnel, isPreviewFetch,
  recordLinkOpen, recordStep, resetForTests,
} from './src/funnel/funnel.js';
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
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
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
const CODE = 'DXGN9HC6';
const open = (url, ua = IPHONE) => new Request(url, { headers: { 'user-agent': ua } });

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
  const res = await handleFunnel(post({ step: 'unlock_view', detail: 'goodnight', ref: '23456789' }, `kide_ref=${CODE}`), env);
  assert.equal(res.status, 200);
  assert.deepEqual(rows(), [{ step: 'unlock_view', ref: CODE, detail: 'goodnight', qa: 0, alerted: 0 }]);
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

const call = (path, body, cookie) => new Request('https://kide.us' + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});

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

await t('a device\'s first play of the day and its used-up day are each counted once', async () => {
  const { env, rows } = fresh({ async getCredits() { return { ok: true, purchases: [] }; } });
  let now = Date.parse('2026-11-04T15:00:00Z');
  let cookie = `kide_ref=${CODE}`;
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
  assert.deepEqual(rows().map((r) => [r.step, r.ref]), [['play_day', CODE], ['gate_day', CODE]]);
});

console.log('\nthe privacy page says what is counted');

await t('the policy names the counts, the cookies, and what they never carry', () => {
  const text = readFileSync('public/privacy/index.html', 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /we count steps on the grown-up pages/);
  assert.match(text, /no device number, no cookie, no IP address, and no email/);
  assert.match(text, /Pip's games send none of it/);
  assert.match(text, /random device number/);
  assert.doesNotMatch(text, /the only cookie this site sets is the short-lived sign-in cookie/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
