// Money path: visit → tool use → signup → credits / paid step → Stripe.
// The session API is the signup record the unlock and the leaderboard call.
// Email codes stay on the existing account proxy. SMS is a channel switch.

import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import { loginChannel, normalizeEmail, toE164, consentText } from './src/account/channel.js';
import { parentIdFor } from './src/account/parent-id.js';
import { setUnlock } from './src/account/store.js';
import { currentParent, handleParentSession } from './src/account/session.js';
import { routeParentAccount } from './src/account/router.js';
import { handleAccount } from './src/worker/account.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.then(() => { console.log(`  ok   ${name}`); pass++; }, (e) => {
        console.log(`  FAIL ${name}\n       ${e.message}`); fail++;
      });
    }
    console.log(`  ok   ${name}`); pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`); fail++;
  }
};

const TOKEN = 'b'.repeat(43);
const COOKIE = `__Host-rft_session=${TOKEN}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`;

function req(path, { method = 'GET', body, cookie, ip = '203.0.113.9' } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (cookie) headers.cookie = cookie;
  return new Request(`https://kide.us${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function read(res) {
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie'), text };
}

function memoryDb() {
  const parents = [];
  const entitlements = [];
  function prepare(sql) {
    const text = sql.replace(/\s+/g, ' ').trim();
    const stmt = {
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() {
        const a = this.args;
        if (text.startsWith('CREATE TABLE')) return { success: true };
        if (text.startsWith('INSERT INTO kide_parents') && text.includes('ON CONFLICT(email)')) {
          const [id, email, phone, created_at] = a;
          if (!parents.some((p) => p.email === email)) parents.push({ id, email, phone_e164: phone, created_at });
          return { success: true };
        }
        if (text.startsWith('INSERT INTO kide_parents') && text.includes('ON CONFLICT(phone_e164)')) {
          const [id, email, phone, created_at] = a;
          if (!parents.some((p) => p.phone_e164 === phone)) parents.push({ id, email, phone_e164: phone, created_at });
          return { success: true };
        }
        if (text.startsWith('UPDATE kide_parents')) {
          const [phone, id] = a;
          const row = parents.find((p) => p.id === id && p.phone_e164 == null);
          if (row) row.phone_e164 = phone;
          return { success: true };
        }
        if (text.startsWith('INSERT INTO kide_entitlements')) {
          const [parent_id, kind, source_ref, status, updated_at] = a;
          const row = { parent_id, kind, source_ref, status, updated_at };
          const i = entitlements.findIndex((e) => e.parent_id === parent_id && e.kind === kind);
          if (i >= 0) entitlements[i] = row;
          else entitlements.push(row);
          return { success: true };
        }
        throw new Error(`unhandled run: ${text}`);
      },
      async first() {
        const a = this.args;
        if (text.includes('FROM kide_parents WHERE email')) return parents.find((p) => p.email === a[0]) || null;
        if (text.includes('FROM kide_parents WHERE phone_e164')) return parents.find((p) => p.phone_e164 === a[0]) || null;
        if (text.includes('FROM kide_entitlements')) {
          return entitlements.find((e) => e.parent_id === a[0] && e.kind === a[1]) || null;
        }
        throw new Error(`unhandled first: ${text}`);
      },
    };
    return stmt;
  }
  return {
    prepare,
    batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
    parents,
    entitlements,
  };
}

function hubSession(result) {
  return {
    async currentSession(input) {
      hubSession.last = input;
      if (result instanceof Error) throw result;
      return typeof result === 'function' ? result(input) : result;
    },
  };
}

console.log('\nparent id and unlock flag');

await t('a browser the hub does not know has no parent and is locked', async () => {
  const none = await currentParent(req('/api/account/session'), {});
  assert.deepEqual(none, { parentId: null, unlocked: false });
  const closed = await currentParent(req('/api/account/session', { cookie: COOKIE }), {
    PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: false, email: 'parent@example.com', message: 'SMS_LIVE_SENDS' }),
  });
  assert.deepEqual(closed, { parentId: null, unlocked: false });
  const thrown = await currentParent(req('/api/account/session', { cookie: COOKIE }), {
    PORTFOLIO_MESSAGING_SERVICE: hubSession(new Error('TWILIO_AUTH_TOKEN missing')),
  });
  assert.deepEqual(thrown, { parentId: null, unlocked: false });
});

await t('the same email is the same parent, and the address is not the id', async () => {
  const email = 'Parent@Example.com';
  const id = await parentIdFor('email', 'parent@example.com');
  assert.equal(await parentIdFor('email', normalizeEmail(email)), id);
  assert.notEqual(await parentIdFor('email', 'other@example.com'), id);
  assert.notEqual(await parentIdFor('phone', '+15555550100'), id);
  assert.match(id, /^p_[a-f0-9]{32}$/);
  assert.equal(id.includes('parent@example.com'), false);

  const db = memoryDb();
  const env = {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: hubSession({
      ok: true,
      email,
      phone: 'not-a-phone',
      sessionToken: TOKEN,
      message: 'You are signed in. ' + TOKEN,
    }),
  };
  const first = await currentParent(req('/api/account/session', { cookie: COOKIE }), env);
  const second = await currentParent(req('/api/account/session', { cookie: COOKIE }), env);
  assert.equal(first.parentId, id);
  assert.equal(second.parentId, id);
  assert.equal(first.unlocked, false);
  assert.equal(db.parents.length, 1);
  assert.equal(db.parents[0].email, 'parent@example.com');
  assert.equal(JSON.stringify(first).includes(TOKEN), false);
  assert.equal(JSON.stringify(first).includes('parent@example.com'), false);
  assert.equal(hubSession.last.domain, 'kide.us');
  assert.equal(hubSession.last.session, COOKIE);
});

await t('setUnlock is what turns the flag on, and a refund turns it off', async () => {
  const db = memoryDb();
  const env = {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: true, email: 'parent@example.com' }),
  };
  const before = await currentParent(req('/api/account/session'), env);
  assert.equal(before.unlocked, false);
  assert.equal(await setUnlock(env, 'not-an-id', 'cs_test'), false);
  assert.equal(await setUnlock({}, before.parentId, 'cs_test'), false);
  assert.equal(await setUnlock(env, before.parentId, 'cs_test_123'), true);
  const paid = await currentParent(req('/api/account/session'), env);
  assert.equal(paid.parentId, before.parentId);
  assert.equal(paid.unlocked, true);
  assert.equal(db.entitlements[0].kind, 'unlock');
  assert.equal(db.entitlements[0].status, 'active');
  assert.equal(db.entitlements[0].source_ref, 'cs_test_123');
  assert.equal(await setUnlock(env, before.parentId, 're_123', 'inactive'), true);
  const refunded = await currentParent(req('/api/account/session'), env);
  assert.equal(refunded.unlocked, false);
  assert.equal(db.entitlements.length, 1);
});

await t('a parent row that already exists keeps its id', async () => {
  const db = memoryDb();
  const email = 'parent@example.com';
  const existing = 'p_' + 'c'.repeat(32);
  db.parents.push({ id: existing, email, phone_e164: null, created_at: '2026-01-01T00:00:00.000Z' });
  const env = { DB: db, PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: true, email }) };
  const view = await currentParent(req('/api/account/session'), env);
  assert.equal(view.parentId, existing);
  assert.notEqual(view.parentId, await parentIdFor('email', email));
  assert.equal(db.parents.length, 1);
});

await t('a missing database still names the parent and stays locked', async () => {
  const env = { PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: true, email: 'parent@example.com' }) };
  const view = await currentParent(req('/api/account/session'), env);
  assert.equal(view.parentId, await parentIdFor('email', 'parent@example.com'));
  assert.equal(view.unlocked, false);
  assert.equal(await setUnlock(env, view.parentId, 'cs_test'), false);
});

await t('a phone the hub names is a parent id of its own', async () => {
  const env = { PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: true, phone: '+1 (555) 555-0100' }) };
  const view = await currentParent(req('/api/account/session'), env);
  assert.equal(view.parentId, await parentIdFor('phone', '+15555550100'));
  assert.equal(view.unlocked, false);
});

console.log('\nsession route');

await t('GET /api/account/session is the two fields, and a POST is a sentence', async () => {
  const env = { PORTFOLIO_MESSAGING_SERVICE: hubSession({ ok: true, email: 'parent@example.com', sessionToken: TOKEN }) };
  const res = await read(await routeParentAccount(req('/api/account/session/', { cookie: COOKIE }), env));
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.data).sort(), ['parentId', 'unlocked']);
  assert.equal(res.data.unlocked, false);
  assert.equal(res.text.includes(TOKEN), false);
  assert.equal(res.text.includes('parent@example.com'), false);
  assert.equal(/error|SMS_|TWILIO|wrangler|otp/i.test(res.text), false);

  const posted = await read(await handleParentSession(req('/api/account/session', { method: 'POST' }), env));
  assert.equal(posted.status, 405);
  assert.equal(posted.data.parentId, null);
  assert.equal(posted.data.unlocked, false);
  assert.match(posted.data.message, /account page/);
  assert.equal(/error|SMS_|TWILIO|binding/i.test(posted.data.message), false);
});

console.log('\nemail stays on the existing account proxy');

await t('email is the channel until the binding says sms', () => {
  assert.equal(loginChannel({}), 'email');
  assert.equal(loginChannel({ KIDE_LOGIN_CHANNEL: 'email' }), 'email');
  assert.equal(loginChannel({ KIDE_LOGIN_CHANNEL: 'SMS' }), 'sms');
  assert.equal(/\$\d|best|fastest|only|currently|available/i.test(consentText()), false);
});

await t('an email code still calls sendLoginCode and ignores a phone', async () => {
  const calls = [];
  const messaging = {
    async sendLoginCode(input) { calls.push(['sendLoginCode', input]); return { ok: true, message: 'We sent a 6-digit code to your email. It expires in 10 minutes.' }; },
    async verifyCode() { throw new Error('verifyCode should not run'); },
    async sendOtp(input) { calls.push(['sendOtp', input]); return { ok: true }; },
    async verifyOtp() { throw new Error('verifyOtp should not run'); },
    async currentSession() { return { ok: false }; },
  };
  const env = { PORTFOLIO_MESSAGING_SERVICE: messaging };
  assert.equal(await routeParentAccount(req('/api/account/code', { method: 'POST', body: { email: 'parent@example.com', phone: '+15555550100' } }), env), null);
  const res = await read(await handleAccount(req('/api/account/code', {
    method: 'POST',
    body: { email: 'parent@example.com', phone: '+15555550100' },
  }), env));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sendLoginCode');
  assert.equal(calls[0][1].phone, undefined);
  assert.equal(calls[0][1].domain, 'kide.us');
});

console.log('\nsms can replace email without a key in this repo');

await t('sms send records consent then sendOtp, and hides the hub internals', async () => {
  const calls = [];
  const messaging = {
    async recordConsent(input) { calls.push(['recordConsent', input]); return { ok: true }; },
    async sendOtp(input) { calls.push(['sendOtp', input]); return { ok: true, message: 'We sent a code by text to ' + input.phone + '.', provider: 'twilio', dryRun: true, phone: input.phone, error: 'dry_run' }; },
    async verifyOtp(input) { calls.push(['verifyOtp', input]); return { ok: true, message: 'You are signed in. ' + TOKEN, phone: input.phone, sessionToken: TOKEN, cookie: COOKIE, provider: 'twilio' }; },
  };
  const env = { KIDE_LOGIN_CHANNEL: 'sms', PORTFOLIO_MESSAGING_SERVICE: messaging };
  const refused = await read(await routeParentAccount(req('/api/account/code', {
    method: 'POST',
    body: { phone: '5555550100', email: 'parent@example.com', consent: false },
  }), env));
  assert.equal(refused.status, 400);
  assert.match(refused.data.message, /Check the box/);
  assert.equal(calls.length, 0);

  const bad = await read(await routeParentAccount(req('/api/account/code', {
    method: 'POST',
    body: { phone: '+447700900123', consent: true },
  }), env));
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /mobile number/);
  assert.equal(calls.length, 0);

  const sent = await read(await routeParentAccount(req('/api/account/code', {
    method: 'POST',
    body: { phone: '(555) 555-0100', email: 'parent@example.com', consent: true, domain: 'evil.test' },
  }), env));
  assert.equal(sent.status, 200);
  assert.equal(sent.data.ok, true);
  assert.equal(calls[0][0], 'recordConsent');
  assert.equal(calls[0][1].domain, 'kide.us');
  assert.equal(calls[0][1].phone, '+15555550100');
  assert.equal(calls[0][1].version, 'kide-otp-1');
  assert.equal(calls[1][0], 'sendOtp');
  assert.equal(calls[1][1].email, undefined);
  assert.equal(calls[1][1].domain, 'kide.us');
  for (const key of ['error', 'provider', 'dryRun', 'phone', 'sessionToken']) assert.equal(key in sent.data, false, key);
  assert.equal(sent.text.includes('5555550100'), false);

  const signed = await read(await routeParentAccount(req('/api/account/verify', {
    method: 'POST',
    body: { phone: '+15555550100', code: '123456' },
  }), env));
  assert.equal(signed.data.signedIn, true);
  assert.equal(signed.setCookie, COOKIE);
  assert.equal(signed.text.includes(TOKEN), false);
  assert.equal('phone' in signed.data, false);
  assert.equal(calls.at(-1)[0], 'verifyOtp');
  assert.equal(calls.at(-1)[1].phone, '+15555550100');
});

await t('sms without the hub methods is a sentence, not a configuration note', async () => {
  const res = await read(await routeParentAccount(req('/api/account/code', {
    method: 'POST',
    body: { phone: '+15555550100', consent: true },
  }), { KIDE_LOGIN_CHANNEL: 'sms', PORTFOLIO_MESSAGING_SERVICE: {} }));
  assert.equal(res.status, 503);
  assert.match(res.data.message, /Try again/);
  assert.equal(/SMS_|TWILIO|binding|not configured/i.test(res.data.message), false);
});

console.log('\nno keys, and the worker still proxies email');

await t('src/account holds no provider secret and does not fetch the hub', () => {
  const files = readdirSync('src/account').filter((name) => name.endsWith('.js'));
  assert.ok(files.includes('session.js'));
  const raw = files.map((name) => readFileSync(`src/account/${name}`, 'utf8')).join('\n');
  const code = raw.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\bfetch\s*\(/.test(code), false);
  assert.equal(/TWILIO_|SMS_API_KEY|SMS_LIVE_SENDS|RESEND_|sk_live|sk_test|AKIA/.test(code), false);
  assert.equal(/riskfreetrial\.org/.test(code), false);
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  assert.match(worker, /routeParentAccount\(request, env\)/);
  assert.match(worker, /handleAccount\(request, env\)/);
  const wrangler = JSON.parse(readFileSync('wrangler.json', 'utf8'));
  const binding = wrangler.services.find((s) => s.binding === 'PORTFOLIO_MESSAGING_SERVICE');
  assert.equal(binding.service, 'riskfreetrial');
  assert.equal(binding.entrypoint, 'PortfolioMessagingService');
  assert.equal(JSON.stringify(wrangler).includes('TWILIO'), false);
  assert.equal(JSON.stringify(wrangler).includes('SMS_API_KEY'), false);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
