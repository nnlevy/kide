// Money path: visit → free Pip practice → /account/ signup → /unlock/ $15 family play.
// The visitor-facing storage promise has to match what this head actually keeps.
// It must not say we store "only" answer timing, and it must not invent
// retention days, Studio, or a live cash-referral ledger.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const PROMISE =
  "Parent accounts only. Kids never sign in. We keep the parent email, and practice timing when they are signed in.";

const FORBIDDEN = [
  /We store only answer timing/i,
  /store only answer timing/i,
  /stores answer timing only/i,
  /A signed-in parent stores answer timing(?! )/i,
  /the only cookie this site sets/i,
  /We don't collect names, ages/i,
  /We never collect a child's name, age/i,
  /latency only/i,
];

function walk(dir, out = [], ext = ['.html', '.js', '.ts', '.mjs']) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'gate-preflight-out'
        || entry.name === 'platform-gate' || entry.name === '.git') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out, ext);
    else if (ext.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

const pages = [
  'index.html',
  ...walk('public', [], ['.html', '.js']),
];
const sources = [
  ...pages,
  'src/worker/index.ts',
  'src/perf/http.js',
  'tools/share/demo.js',
];

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
    pass += 1;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail += 1;
  }
}

console.log('\nstorage copy matches the head');

t('the shared promise is on every parent-journey page and the gift HTML', () => {
  const files = [
    'index.html',
    'public/play/index.html',
    'public/parent/index.html',
    'public/account/index.html',
    'public/unlock/index.html',
    'public/privacy/index.html',
    'src/worker/index.ts',
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert(text.includes(PROMISE), `${file} is missing the shared storage promise`);
  }
});

t('no visitor-facing page or API source still says we store only timing', () => {
  const hits = [];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${file} :: ${re}`);
    }
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

t('the bespoke substitute gate is gone', () => {
  assert.equal(existsSync('scripts/gate-preflight.mjs'), false);
});

t('privacy names the actual stores without inventing deletion days or Studio', () => {
  const page = readFileSync('public/privacy/index.html', 'utf8');
  assert.match(page, /email address/);
  assert.match(page, /public part of the passkey/);
  assert.match(page, /sign-in cookie/);
  assert.match(page, /device cookie/);
  assert.match(page, /share link can set a short cookie/);
  assert.match(page, /practice timing/);
  assert.match(page, /which item, which skill, how long/);
  assert.match(page, /practice record/);
  assert.match(page, /child's age in years/);
  assert.match(page, /gift card can carry a child's name in the link/);
  assert.match(page, /weekly board/);
  assert.match(page, /Delete everything on the parent page/);
  assert.equal(/\$15\/month|Lesson Studio|studio_monthly|we delete after \d+ days|retained for \d+ days/i.test(page), false);
  assert.equal(/We store only answer timing/i.test(page), false);
  assert.equal(/the only cookie this site sets/i.test(page), false);
});

t('play events comment and response still name device or account rows, not timing-only', () => {
  const http = readFileSync('src/perf/http.js', 'utf8');
  assert.match(http, /stored: "device"/);
  assert.match(http, /stored: "account"/);
  assert.match(http, /item, skill, latency, whether it was correct, and mode/);
  assert.equal(/latency only/i.test(http), false);
  assert.equal(/answer timing only/i.test(http), false);
});

t('the parent next step stays the existing account and family-unlock journey', () => {
  const home = readFileSync('index.html', 'utf8');
  const play = readFileSync('public/play/index.html', 'utf8');
  const parent = readFileSync('public/parent/index.html', 'utf8');
  const account = readFileSync('public/account/index.html', 'utf8');
  const unlock = readFileSync('public/unlock/index.html', 'utf8');
  assert.match(home, /href="\/account"/);
  assert.match(home, /href="\/play"/);
  assert.match(play, /href="\/account\/"/);
  assert.match(play, /href="\/unlock\/"/);
  assert.match(parent, /href="\/account\/"/);
  assert.match(parent, /href="\/unlock\/"/);
  assert.match(parent, /href="\/play\/"/);
  assert.match(account, /href="\/unlock\/"/);
  assert.match(unlock, /href="\/account\/"/);
  assert.match(unlock, /One payment of <a id="family-price" href="\/unlock\/#family-price">\$15<\/a>/);
  assert.equal(/\$15\/month|Lesson Studio/i.test(home + play + parent + account + unlock), false);
});

t('parental controls on the parent page still cover listening, the on-device record, and delete', () => {
  const parent = readFileSync('public/parent/index.html', 'utf8');
  assert.match(parent, /id="btnMic"/);
  assert.match(parent, /id="btnClear"/);
  assert.match(parent, /id="visitAge"/);
  assert.match(parent, /Delete everything/);
  assert.match(parent, /Listening/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
