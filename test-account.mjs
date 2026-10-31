// Money path: visit → tool use → signup → credits / paid step → Stripe.
// Parent signup must call PortfolioMessagingService and must not grow a second
// code store. These tests are the boundary: what the browser is allowed to
// see, which hub method is called, and which copy a visitor still reads.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve, sep, extname } from 'node:path';
import assert from 'node:assert';
import { handleAccount, publicKeyForBrowser, visitorSentence } from './src/worker/account.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.then(() => { console.log(`  ok   ${name}`); pass++; }, (e) => {
        if (e && e.skip) { console.log(`  skip ${name}`); return; }
        console.log(`  FAIL ${name}\n       ${e.message}`); fail++;
      });
    }
    console.log(`  ok   ${name}`); pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`); fail++;
  }
};

const TOKEN = 'a'.repeat(43);
const COOKIE = `__Host-rft_session=${TOKEN}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`;

function req(path, { method = 'POST', body, cookie, ip = '203.0.113.8' } = {}) {
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

function hub(overrides = {}) {
  const calls = [];
  const messaging = {
    async sendLoginCode(input) { calls.push(['sendLoginCode', input]); return overrides.sendLoginCode ?? { ok: true, message: 'We sent a 6-digit code to your email. It expires in 10 minutes.', channel: 'email', provider: 'resend', dryRun: false, email: input.email }; },
    async verifyCode(input) { calls.push(['verifyCode', input]); return overrides.verifyCode ?? { ok: true, message: 'You are signed in.', email: input.email, sessionToken: TOKEN, cookie: COOKIE, error: 'should-not-leak' }; },
    async preparePasskeyRegistration(input) { calls.push(['preparePasskeyRegistration', input]); return overrides.preparePasskeyRegistration ?? { ok: true, message: 'Save a passkey for next time. You can still use an email code.', publicKey: { challenge: 'c'.repeat(43), rp: { name: 'kide.us', id: 'kide.us' }, user: { id: 'u'.repeat(43), name: input.email, displayName: input.email }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, attestation: 'none', authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' } } }; },
    async registerPasskey(input) { calls.push(['registerPasskey', input]); return overrides.registerPasskey ?? { ok: true, message: 'Your passkey is saved. You can use it next time you sign in.', email: input.email }; },
    async preparePasskeySignIn(input) { calls.push(['preparePasskeySignIn', input]); return overrides.preparePasskeySignIn ?? { ok: true, message: 'Use your passkey to sign in.', publicKey: { challenge: 'd'.repeat(43), timeout: 60000, rpId: 'kide.us', userVerification: 'preferred' } }; },
    async signInPasskey(input) { calls.push(['signInPasskey', input]); return overrides.signInPasskey ?? { ok: true, message: 'You are signed in.', email: 'parent@example.com' }; },
    ...overrides.extra,
  };
  return { calls, messaging };
}

const FORBIDDEN_KEYS = ['error', 'provider', 'dryRun', 'sessionToken', 'cookie', 'attemptsRemaining', 'channel', 'phone'];

console.log('\nparent signup calls the messaging service');

await t('an email code is sendLoginCode for kide.us only', async () => {
  const { calls, messaging } = hub();
  const res = await read(await handleAccount(req('/api/account/code', {
    body: { email: 'Parent@Example.com', domain: 'evil.test', phone: '+15555550100' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sendLoginCode');
  assert.equal(calls[0][1].domain, 'kide.us');
  assert.equal(calls[0][1].email, 'parent@example.com');
  assert.equal(calls[0][1].ip, '203.0.113.8');
  assert.equal(calls[0][1].phone, undefined);
  assert.equal(calls[0][1].domain === 'evil.test', false);
  assert.equal(res.data.message.includes('6-digit'), true);
  for (const key of FORBIDDEN_KEYS) assert.equal(key in res.data, false, key);
});

await t('a good code sets the hub cookie and hides the token', async () => {
  const { messaging } = hub();
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '123456' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 200);
  assert.equal(res.data.signedIn, true);
  assert.equal(res.data.email, 'parent@example.com');
  assert.equal(res.setCookie, COOKIE);
  assert.equal(res.text.includes(TOKEN), false);
  assert.equal(res.text.includes('should-not-leak'), false);
  for (const key of FORBIDDEN_KEYS) assert.equal(key in res.data, false, key);
});

await t('a sessionToken without a cookie still becomes the host cookie', async () => {
  const { messaging } = hub({
    verifyCode: { ok: true, message: 'You are signed in.', email: 'parent@example.com', sessionToken: TOKEN },
  });
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '123456' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.setCookie, COOKIE);
  assert.equal(res.data.signedIn, true);
  assert.equal(res.data.email, 'parent@example.com');
  assert.equal(res.text.includes(TOKEN), false);
});

await t('a cookie with a Domain attribute is not set', async () => {
  const { messaging } = hub({
    verifyCode: {
      ok: true,
      message: 'You are signed in.',
      email: 'parent@example.com',
      cookie: `__Host-rft_session=${TOKEN}; Domain=kide.us; HttpOnly; Secure; Path=/`,
    },
  });
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '123456' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.setCookie, null);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.signedIn, false);
  assert.equal('email' in res.data, false);
  assert.equal(res.text.includes(TOKEN), false);
});

await t('a host cookie without a hub email is attached but not a sign-in', async () => {
  const { messaging } = hub({
    verifyCode: { ok: true, message: 'You are signed in.', cookie: COOKIE, sessionToken: TOKEN },
  });
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '123456' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.setCookie, COOKIE);
  assert.equal(res.data.signedIn, false);
  assert.equal('email' in res.data, false);
  assert.equal(res.text.includes(TOKEN), false);
});

await t('a wrong code shows the hub sentence, not its code', async () => {
  const { messaging } = hub({
    verifyCode: { ok: false, error: 'locked', message: 'Too many tries. Ask for a new code once this one expires.', attemptsRemaining: 0 },
  });
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '000000' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 400);
  assert.equal(res.data.ok, false);
  assert.equal(res.data.message, 'Too many tries. Ask for a new code once this one expires.');
  assert.equal(res.setCookie, null);
  for (const key of FORBIDDEN_KEYS) assert.equal(key in res.data, false, key);
});

await t('an error-code message is replaced with a sentence', () => {
  assert.equal(visitorSentence('locked').includes(' '), true);
  assert.equal(visitorSentence('locked'), 'Something went wrong. Try again in a moment.');
  assert.equal(visitorSentence('SMS_LIVE_SENDS is off'), 'Something went wrong. Try again in a moment.');
});

await t('me reads currentSession and fails closed when the hub has no such method', async () => {
  const { calls, messaging } = hub();
  const missing = await read(await handleAccount(req('/api/account/me', { method: 'GET', cookie: COOKIE }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(missing.status, 503);
  assert.equal(missing.data.ok, false);
  assert.equal(missing.data.signedIn, false);
  assert.equal('email' in missing.data, false);
  assert.equal('sessionKnown' in missing.data, false);
  assert.equal(missing.text.includes(TOKEN), false);
  assert.equal(missing.text.includes('error'), false);

  messaging.currentSession = async (input) => {
    calls.push(['currentSession', input]);
    return { ok: true, email: 'parent@example.com', message: 'You are signed in. ' + TOKEN, sessionToken: TOKEN };
  };
  const found = await read(await handleAccount(req('/api/account/me', { method: 'GET', cookie: `kide=1; ${COOKIE}` }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(found.status, 200);
  assert.equal(found.data.signedIn, true);
  assert.equal('sessionKnown' in found.data, false);
  assert.equal(found.data.email, 'parent@example.com');
  assert.equal(found.text.includes(TOKEN), false);
  assert.equal(calls.at(-1)[0], 'currentSession');
  assert.equal(calls.at(-1)[1].domain, 'kide.us');
  assert.equal(calls.at(-1)[1].session, `kide=1; ${COOKIE}`);

  messaging.currentSession = async () => ({ ok: false, email: 'parent@example.com', message: 'Sign in with the code we email you.' });
  const closed = await read(await handleAccount(req('/api/account/me', { method: 'GET', cookie: COOKIE }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(closed.status, 200);
  assert.equal(closed.data.ok, false);
  assert.equal(closed.data.signedIn, false);
  assert.equal('email' in closed.data, false);

  messaging.currentSession = async () => ({ ok: true, message: 'You are signed in.' });
  const nameless = await read(await handleAccount(req('/api/account/me', { method: 'GET', cookie: COOKIE }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(nameless.status, 200);
  assert.equal(nameless.data.signedIn, false);
  assert.equal('email' in nameless.data, false);
});

await t('sign-out calls endSession with kide.us and the cookie, and fails closed without it', async () => {
  const { calls, messaging } = hub();
  const missing = await read(await handleAccount(req('/api/account/signout', { cookie: COOKIE }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(missing.status, 503);
  assert.equal(missing.data.ok, false);
  assert.equal(missing.data.signedIn, false);
  assert.match(missing.setCookie, /Max-Age=0/);
  assert.equal(calls.some((c) => c[0] === 'endSession'), false);

  messaging.endSession = async (input) => { calls.push(['endSession', input]); return { ok: true }; };
  const res = await read(await handleAccount(req('/api/account/signout', { cookie: COOKIE }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.signedIn, false);
  assert.match(res.setCookie, /Max-Age=0/);
  assert.equal(calls.at(-1)[0], 'endSession');
  assert.deepEqual(calls.at(-1)[1], { domain: 'kide.us', session: COOKIE });
});

await t('passkey registration forwards the session and a bounded credential', async () => {
  const { calls, messaging } = hub();
  const credential = {
    id: 'cred',
    rawId: 'c'.repeat(40),
    type: 'public-key',
    response: { clientDataJSON: 'j'.repeat(40), attestationObject: 'k'.repeat(40), extra: '<script>' },
    domain: 'evil.test',
  };
  const res = await read(await handleAccount(req('/api/account/passkey/register', {
    body: { email: 'parent@example.com', credential },
    cookie: COOKIE,
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 200);
  assert.equal(calls[0][0], 'registerPasskey');
  assert.equal(calls[0][1].domain, 'kide.us');
  assert.equal(calls[0][1].session, COOKIE);
  assert.equal(calls[0][1].credential.response.clientDataJSON, 'j'.repeat(40));
  assert.equal(calls[0][1].credential.response.extra, undefined);
});

await t('passkey options are pinned to kide.us', () => {
  const pk = publicKeyForBrowser({
    challenge: 'c'.repeat(43),
    rp: { name: 'elsewhere.test', id: 'elsewhere.test' },
    rpId: 'elsewhere.test',
    user: { id: 'u'.repeat(43), name: 'parent@example.com', displayName: 'parent@example.com' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -999 }],
    attestation: 'direct',
  });
  assert.equal(pk.rp.id, 'kide.us');
  assert.equal(pk.rpId, 'kide.us');
  assert.deepEqual(pk.pubKeyCredParams, [{ type: 'public-key', alg: -7 }]);
  assert.equal(pk.attestation, undefined);
});

await t('passkey success without a session is not signed in', async () => {
  const cred = { id: 'c'.repeat(20), rawId: 'c'.repeat(20), type: 'public-key', response: { clientDataJSON: 'j'.repeat(20), authenticatorData: 'b'.repeat(20), signature: 's'.repeat(20) } };
  const none = hub();
  const open = await read(await handleAccount(req('/api/account/passkey/signin', {
    body: { credential: cred },
  }), { PORTFOLIO_MESSAGING_SERVICE: none.messaging }));
  assert.equal(open.data.ok, true);
  assert.equal(open.data.signedIn, false);
  assert.equal('email' in open.data, false);
  assert.equal(open.setCookie, null);

  const leaked = hub({
    signInPasskey: { ok: true, message: 'You are signed in. ' + TOKEN, email: 'parent@example.com', cookie: COOKIE, sessionToken: TOKEN, error: 'nope', provider: 'resend', attemptsRemaining: 3 },
  });
  const closed = await read(await handleAccount(req('/api/account/passkey/signin', {
    body: { credential: cred },
  }), { PORTFOLIO_MESSAGING_SERVICE: leaked.messaging }));
  assert.equal(closed.status, 200);
  assert.equal(closed.data.signedIn, true);
  assert.equal(closed.data.email, 'parent@example.com');
  assert.equal(closed.setCookie, COOKIE);
  assert.equal(closed.text.includes(TOKEN), false);
  assert.equal(closed.text.includes('__Host'), false);
  for (const key of FORBIDDEN_KEYS) assert.equal(key in closed.data, false, key);
});

await t('a session token inside the hub message never reaches the browser', async () => {
  const { messaging } = hub({
    verifyCode: {
      ok: true,
      message: 'You are signed in. ' + TOKEN + ' __Host-rft_session=' + TOKEN,
      email: 'parent@example.com',
      sessionToken: TOKEN,
      cookie: COOKIE,
      attemptsRemaining: 2,
      provider: 'resend',
      error: 'should-not-leak',
    },
  });
  const res = await read(await handleAccount(req('/api/account/verify', {
    body: { email: 'parent@example.com', code: '123456' },
  }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 200);
  assert.equal(res.data.signedIn, true);
  assert.equal(res.data.email, 'parent@example.com');
  assert.equal(res.setCookie, COOKIE);
  assert.equal(res.text.includes(TOKEN), false);
  assert.equal(res.text.includes('__Host'), false);
  for (const key of FORBIDDEN_KEYS) assert.equal(key in res.data, false, key);
});

await t('a missing binding is a sentence, not a configuration error', async () => {
  const res = await read(await handleAccount(req('/api/account/code', { body: { email: 'parent@example.com' } }), {}));
  assert.equal(res.status, 503);
  assert.equal(res.data.ok, false);
  assert.match(res.data.message, /Try again/);
  assert.equal(/binding|wrangler|SMS_|not configured|503/i.test(res.data.message), false);
});

await t('a bad email never reaches the hub', async () => {
  const { calls, messaging } = hub();
  const res = await read(await handleAccount(req('/api/account/code', { body: { email: 'not-an-email' } }), { PORTFOLIO_MESSAGING_SERVICE: messaging }));
  assert.equal(res.status, 400);
  assert.equal(res.data.message, 'Enter a valid email address.');
  assert.equal(calls.length, 0);
});

console.log('\nthe worker is a proxy, and challenge mode stays');

await t('account.js does not send mail, mint codes, or fetch the hub', () => {
  const raw = readFileSync('src/worker/account.js', 'utf8');
  const code = raw.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\bfetch\s*\(/.test(code), false);
  assert.equal(/generateCode|email_otp|sms_otp|SMS_OTP_PEPPER|TWILIO_|RESEND_/.test(code), false);
  assert.equal(/riskfreetrial\.org/.test(code), false);
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  assert.match(worker, /handleAccount\(request, env\)/);
  assert.match(worker, /dispatchChallenge/);
  assert.match(worker, /startsWith\("\/api\/clinician\/"\)/);
  const offerings = worker.match(/const OFFERINGS = new Set\(\[([^\]]*)\]\)/)[1];
  assert.equal(offerings.includes('clinician_report'), true);
  assert.equal(offerings.includes('parent'), false);
});

await t('wrangler binds PortfolioMessagingService on riskfreetrial', () => {
  const wrangler = JSON.parse(readFileSync('wrangler.json', 'utf8'));
  const binding = wrangler.services.find((s) => s.binding === 'PORTFOLIO_MESSAGING_SERVICE');
  assert.ok(binding);
  assert.equal(binding.service, 'riskfreetrial');
  assert.equal(binding.entrypoint, 'PortfolioMessagingService');
  assert.equal(binding.remote, true);
});

console.log('\nvisitor copy');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

await t('the live site no longer says there are no accounts', () => {
  const files = ['index.html', ...walk('public')];
  const hits = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    if (/no accounts/i.test(html)) hits.push(file);
  }
  const worker = readFileSync('src/worker/index.ts', 'utf8');
  const giftStart = worker.indexOf('function renderGift');
  const gift = worker.slice(giftStart, worker.indexOf('\nfunction ', giftStart + 10));
  if (/no accounts/i.test(gift)) hits.push('src/worker/index.ts gift');
  // The billing comment still explains why this worker does not spend credits.
  // That sentence is not shown to a visitor. It is the only "no accounts" left.
  const leftover = worker.match(/no accounts/gi) || [];
  assert.equal(leftover.length, 1, 'visitor-facing worker copy still says there are no accounts');
  assert.deepEqual(hits, []);
});

await t('the account page speaks in sentences and keeps the theme', () => {
  const page = readFileSync('public/account/index.html', 'utf8');
  assert.match(page, /#56C6E6/);
  assert.match(page, /#FF8A73/);
  assert.match(page, /#FFFBF2/);
  assert.match(page, /mobile\.css/);
  assert.match(page, /href="\/play"/);
  assert.match(page, /href="\/words"/);
  assert.match(page, /href="\/sounds"/);
  assert.match(page, /href="\/guides"/);
  assert.equal(/SMS_|TWILIO|wrangler|PortfolioMessaging|invalid_|error code|otp/i.test(page), false);
  assert.match(page, /\/api\/account\/code/);
  assert.match(page, /\/api\/account\/verify/);
  assert.match(page, /passkey\/register/);
  assert.match(page, /passkey\/signin/);
  assert.equal(/clinician|\$39|stripe/i.test(page), false);
  assert.equal(/sessionStorage|localStorage|sessionKnown/.test(page), false);
  assert.match(page, /data\.signedIn === true/);
  assert.match(page, /typeof data\.email === "string"/);
  assert.match(page, /Signed in as /);
  assert.equal(/data\.email \|\|/.test(page), false);
  assert.equal(/signed\.email \|\|/.test(page), false);
});

await t('the homepage links the account page and still sells play in coral', () => {
  const home = readFileSync('index.html', 'utf8');
  assert.match(home, /href="\/account"/);
  assert.equal(/<span>No accounts<\/span>/.test(home), false);
  assert.match(home, /href="\/play"/);
  assert.match(home, /Buy a licence — \$39/);
});

console.log('\n320px');

const LONG_EMAIL = `${'a'.repeat(40)}@example.com`;

function measureLayout() {
  const de = document.documentElement;
  const MIN = 44;
  return {
    overflow: de.scrollWidth - de.clientWidth,
    outside: [...document.querySelectorAll('body *')].filter((el) => {
      if (el.closest('svg')) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (b.right > de.clientWidth + 1 || b.left < -1);
    }).slice(0, 4).map((el) => (el.id ? '#' + el.id : el.tagName.toLowerCase())),
    small: [...document.querySelectorAll('button, input, a.nav-play, nav a')].filter((el) => {
      const b = el.getBoundingClientRect();
      if (el.hidden || b.width === 0 || b.height === 0) return false;
      return b.width < MIN || b.height < MIN;
    }).slice(0, 4).map((el) => (el.id || el.className || el.tagName) + ' '
      + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)),
    tinyFont: [...document.querySelectorAll('input')].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => (el.id || el.tagName) + ' ' + getComputedStyle(el).fontSize),
    who: (document.getElementById('who') || {}).textContent || '',
  };
}

function serveAccount(port) {
  const root = resolve('public');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  const server = createServer((req, res) => {
    let path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (path === '/account' || path === '/account/') path = '/account/index.html';
    const file = resolve(root, path.replace(/^\/+/, ''));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403); res.end(); return;
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('missing');
    }
  });
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveListen(server));
  });
}

// Runs after the unit tests. A missing browser is a skip, not a failure, and
// it must not exit before those tests have already been counted.
await t('account page at 320px: no overflow, 44px controls, 16px inputs, long email', async () => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { try { ({ chromium } = await import('playwright-core')); } catch { /* none */ } }
  const chrome = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find((p) => existsSync(p));
  if (!chromium || !chrome) {
    throw Object.assign(new Error('playwright or system chrome is not installed'), { skip: true });
  }
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (e) {
    throw Object.assign(new Error(String(e.message).split('\n')[0]), { skip: true });
  }
  const port = 9327;
  const server = await serveAccount(port);
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await page.route('**/api/account/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, signedIn: false, message: 'Sign in with the code we email you.' }),
    }));
    await page.goto(`http://127.0.0.1:${port}/account/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('#email');
    await page.fill('#email', LONG_EMAIL);
    const form = await page.evaluate(measureLayout);
    assert.ok(form.overflow <= 1, `overflow ${form.overflow}px`);
    assert.deepEqual(form.outside, [], form.outside.join(','));
    assert.deepEqual(form.small, [], form.small.join(' , '));
    assert.deepEqual(form.tinyFont, [], form.tinyFont.join(' , '));
    const emailBox = await page.locator('#email').boundingBox();
    assert.ok(emailBox && emailBox.height >= 44, 'email control shorter than 44px');
    assert.equal(await page.locator('#email').evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16), true);

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
    const signed = await page.evaluate(measureLayout);
    assert.equal(signed.who, 'Signed in as ' + LONG_EMAIL);
    assert.ok(signed.overflow <= 1, `signed-in overflow ${signed.overflow}px`);
    assert.deepEqual(signed.outside, [], signed.outside.join(','));
    assert.deepEqual(signed.small, [], signed.small.join(' , '));
    const whoBox = await page.locator('#who').boundingBox();
    assert.ok(whoBox && whoBox.x >= -1 && whoBox.x + whoBox.width <= 321, `who box ${whoBox && JSON.stringify(whoBox)}`);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await new Promise((done) => server.close(done));
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
