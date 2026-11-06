// Money path: visit → tool use → signup → paid step → Stripe.
// Counts and alerts. No live checkout, no email, no hub call that sends one.

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';

import { handleUnlock } from './src/unlock/handler.js';
import { handleAccount } from './src/worker/account.js';
import { deviceUnlockKey } from './src/unlock/entitlement.js';
import {
  claimAlert,
  handleFunnel,
  reconcilePaid,
  recordLinkOpen,
  recordStep,
  resetForTests,
} from './src/funnel/funnel.js';

const SID = 'cs_test_a1b2c3d4e5f6g7h8';
const SID_B = 'cs_test_b2c3d4e5f6g7h8i9';
const SESSION = '__Host-rft_session=abcdefghijklmnopqrstuvwxyzABCDEFGHIJK12345';

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.stack || e.message}`); fail++; }
};

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return { sqlite, DB: { prepare: (sql) => stmt(sql) } };
}

function memoryKv() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    has(k) { return m.has(k); },
  };
}

function req(path, { method = 'GET', cookie = '', body, ua = '' } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (ua) headers['user-agent'] = ua;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request('https://kide.us' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

await t('two link alerts in one window deliver once and never email', async () => {
  resetForTests();
  const { sqlite, DB } = d1();
  let emails = 0;
  const env = {
    DB,
    PORTFOLIO_BILLING_SERVICE: {
      async notifyReferralActivity() { emails++; return { ok: true }; },
    },
  };
  const now = Date.parse('2026-11-04T12:00:00Z');
  const a = claimAlert(env, { step: 'link_open', ref: 'DXGN9HC6', now });
  const b = claimAlert(env, { step: 'link_open', ref: 'DXGN9HC6', now: now + 1 });
  const [first, second] = await Promise.all([a, b]);
  assert.equal(Number(first) + Number(second), 1);
  assert.equal(emails, 0);
  const rows = sqlite.prepare('SELECT COUNT(*) AS n FROM kide_funnel_alerts').get();
  assert.equal(rows.n, 1);
  const later = await claimAlert(env, { step: 'checkout_open', ref: 'DXGN9HC6', now: now + 11 * 60 * 1000 });
  assert.equal(later, true);
  assert.equal(emails, 0);
});

await t('the day cap stops the 21st alert', async () => {
  resetForTests();
  const { DB } = d1();
  const env = { DB };
  const start = Date.parse('2026-11-04T00:10:00Z');
  let delivered = 0;
  for (let i = 0; i < 21; i++) {
    if (await claimAlert(env, { step: 'link_open', ref: 'DXGN9HC6', now: start + i * 11 * 60 * 1000 })) delivered++;
  }
  assert.equal(delivered, 20);
});

await t('one paid row per Checkout session, and a refund clears that count', async () => {
  resetForTests();
  const { sqlite, DB } = d1();
  const env = { DB };
  const paid = {
    ok: true,
    purchases: [
      { domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID, status: 'paid' },
      { domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID_B, status: 'paid' },
    ],
  };
  await Promise.all([
    reconcilePaid(env, paid, 'DXGN9HC6', 1),
    reconcilePaid(env, paid, 'DXGN9HC6', 2),
  ]);
  const open = sqlite.prepare('SELECT COUNT(*) AS n FROM kide_funnel_paid WHERE refunded_at IS NULL').get();
  assert.equal(open.n, 2);
  await reconcilePaid(env, {
    ok: true,
    purchases: [
      { domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID, status: 'refunded' },
      { domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID_B, status: 'paid' },
    ],
  }, 'DXGN9HC6', 3);
  const left = sqlite.prepare('SELECT source_ref FROM kide_funnel_paid WHERE refunded_at IS NULL').all();
  assert.deepEqual(left.map((row) => row.source_ref), [SID_B]);
  const refunded = sqlite.prepare('SELECT source_ref FROM kide_funnel_paid WHERE refunded_at IS NOT NULL').all();
  assert.deepEqual(refunded.map((row) => row.source_ref), [SID]);
});

await t('a qa flag cannot open checkout or hide a later real count', async () => {
  resetForTests();
  const { sqlite, DB } = d1();
  const calls = [];
  const env = {
    DB,
    KIDE_LEADS: memoryKv(),
    PORTFOLIO_MESSAGING_SERVICE: { async currentSession() { return { ok: true, email: 'parent@example.com' }; } },
    PORTFOLIO_BILLING_SERVICE: {
      async notifyReferralActivity() { throw new Error('email'); },
      async createCheckout(input) {
        calls.push(input.email);
        return { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_fake' };
      },
      async getCredits() {
        return { ok: true, purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID, status: 'paid' }] };
      },
    },
  };
  const qa = await handleUnlock(req('/api/unlock/checkout', {
    method: 'POST', cookie: SESSION, body: { qa: true, email: 'other@example.com' },
  }), env, { now: 1 });
  assert.equal(qa.status, 400);
  const qaNum = await handleUnlock(req('/api/unlock/checkout?kide_qa=1', {
    method: 'POST', cookie: SESSION, body: { qa: 'true' },
  }), env, { now: 1 });
  assert.equal(qaNum.status, 400);
  assert.equal(calls.length, 0);
  const real = await handleUnlock(req('/api/unlock/checkout', {
    method: 'POST', cookie: `${SESSION}; kide_ref=DXGN9HC6`, body: { qa: false },
  }), env, { now: 2 });
  assert.equal(real.status, 200);
  assert.deepEqual(calls, ['parent@example.com']);
  const confirm = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST', cookie: `${SESSION}; kide_ref=DXGN9HC6`, body: { email: 'other@example.com', qa: true },
  }), env, { now: 3 });
  assert.equal((await confirm.json()).unlocked, true);
  const paid = sqlite.prepare('SELECT source_ref, refunded_at FROM kide_funnel_paid').all();
  assert.equal(paid.length, 1);
  assert.equal(paid[0].source_ref, SID);
  assert.equal(paid[0].refunded_at, null);
  env.PORTFOLIO_BILLING_SERVICE.getCredits = async () => ({
    ok: true,
    purchases: [{ domain: 'kide.us', offeringId: 'family_unlock', sourceRef: SID, status: 'refunded' }],
  });
  const again = await handleUnlock(req('/api/unlock/confirm', {
    method: 'POST', cookie: SESSION,
  }), env, { now: 4 });
  assert.equal((await again.json()).unlocked, false);
  const after = sqlite.prepare('SELECT refunded_at FROM kide_funnel_paid').get();
  assert.ok(after.refunded_at);
});

await t('browser qa is stored as a real step and a preview is not a tap', async () => {
  resetForTests();
  const { sqlite, DB } = d1();
  const env = { DB };
  const posted = await handleFunnel(req('/api/funnel', {
    method: 'POST', cookie: 'kide_ref=DXGN9HC6', body: { step: 'home_cta', qa: true, email: 'parent@example.com' },
  }), env, 10);
  assert.equal(posted.status, 200);
  const row = sqlite.prepare('SELECT step, ref, detail FROM kide_funnel_events').get();
  assert.deepEqual(row, { step: 'home_cta', ref: 'DXGN9HC6', detail: '' });
  await recordLinkOpen(req('/?ref=DXGN9HC6', { ua: 'facebookexternalhit/1.1' }), env, 11);
  await recordLinkOpen(req('/?ref=DXGN9HC6', { ua: 'Mozilla/5.0 (iPhone)' }), env, 12);
  const steps = sqlite.prepare("SELECT step FROM kide_funnel_events WHERE step != 'home_cta' ORDER BY step").all();
  assert.deepEqual(steps.map((r) => r.step), ['link_open', 'link_preview']);
});

await t('two first ticks record one play_day', async () => {
  resetForTests();
  const { sqlite, DB } = d1();
  const env = { DB, KIDE_LEADS: memoryKv(), PORTFOLIO_BILLING_SERVICE: { async getCredits() { return { ok: true, purchases: [] }; } } };
  const tick = () => handleUnlock(req('/api/unlock/tick', {
    method: 'POST', cookie: 'kide_ref=DXGN9HC6', body: {},
  }), env, { now: Date.parse('2026-11-04T12:00:00Z') });
  await Promise.all([tick(), tick()]);
  const n = sqlite.prepare("SELECT COUNT(*) AS n FROM kide_funnel_events WHERE step = 'play_day'").get();
  assert.equal(n.n, 1);
});

await t('sign-out deletes a planted device unlock', async () => {
  const kv = memoryKv();
  const device = 'abcdefghijklmnopqrstuvwx';
  await kv.put(deviceUnlockKey(device), JSON.stringify({ unlocked: true, email: 'parent@example.com' }));
  const env = {
    KIDE_LEADS: kv,
    PORTFOLIO_MESSAGING_SERVICE: {
      async sendLoginCode() { return { ok: true }; },
      async verifyCode() { return { ok: true }; },
      async endSession() { return { ok: true }; },
    },
  };
  const res = await handleAccount(req('/api/account/signout', {
    method: 'POST', cookie: `kide_device=${device}; ${SESSION}`,
  }), env);
  assert.equal(res.status, 200);
  assert.equal(kv.has(deviceUnlockKey(device)), false);
});

await t('an unknown step is refused and a child path is not a browser step', async () => {
  resetForTests();
  const { DB } = d1();
  const bad = await handleFunnel(req('/api/funnel', { method: 'POST', body: { step: 'play_day' } }), { DB }, 1);
  assert.equal(bad.status, 400);
  const id = await recordStep({ DB }, { step: 'nope', now: 1 });
  assert.equal(id, 0);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
