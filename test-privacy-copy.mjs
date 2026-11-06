// Money path: visit → free Pip practice → /account/ signup → /unlock/ $15 family play.
// Visitor copy must match THIS head. It must not say we store "only" answer
// timing, invent retention days or Studio, or pretend unmerged PR16 funnel
// writes are live. Reviewer10409 owns the separate 20+16 auth/unlock/funnel
// correction — do not add play_day / gate_day / paid-dedup / referrer-count
// collection here.
//
// Live on this head:
//   parent email + passkey public (kide_parents); session cookie __Host-rft_session
//   (hub currentSession → {ok:true,email} from a domain-scoped hashed token;
//   cookie Max-Age 15 minutes; expire-on-read / logout / reissue can delete
//   that row. Not a parent-role, adulthood, family, or payment proof. Not
//   automatic purge of every expired login_session row. Source equality of
//   a686eaa messaging/passkey snapshots is not live deployment/auth proof.
//   A leaf helper named verifiedParentEmail is not itself a defect; the wire
//   result is {ok:true,email}. 10409 owns shared-auth correction.);
//   signed-in /api/play/events rows (item, skill, latency, correct, mode);
//   device cookie kide_device on free-play tick (and after unlock); share-link
//   cookie kide_ref for 30 days (GET/HEAD); on-device journal / visitAge /
//   companion / listening consent / game progress; gift names in the URL
//   (rendered when opened, not saved as a KV copy); compete handle if opted in;
//   notify email (name/need only if typed — current forms send email only).
//   Play tickSession is local sleepy UI only. Client does not POST /api/funnel.
// Not live on this head (PR16 review facts; 20+16 owner):
//   server play_day / gate_day on the play tick carrying kide_ref;
//   2-day paid-dedup email-hash KV; funnel events with no TTL;
//   notification source sending referral code+counts to the referrer.
// Compatibility: do not promise "games send none of this" or "counts are not
// shared". Leave those facts for the 20+16 page when that journey ships.
//
// PR22 independent review (5d1d974; 4a4 now owns corrective authorship; next
// head needs a different reviewer). Do not implement those fixes here:
//   POST /api/studio/clear is denied without enabled monthly entitlement;
//   /parent Delete everything ignores that failure; expiry hides approved
//   lessons. Do not promise those rows are wiped, or that a future fix is
//   already on this head. Studio notes are dropped before the model/lesson
//   row on that inspected path and are not logged there; the filter still
//   accepts a name-bearing sample ("for Eli please"), so "never collect a
//   child's name" is not an absolute this head may claim.
//   Unpatched static 480/480 plus a separate private 30/30 did not prove
//   Worker execution or current canonical-kit (ab09c0c+claims-fix) compliance.
// Planning addendum 2026-11-05: "only answer timing" was suggested scope copy,
// not Nir's requirement. $6/referral and $50 via Connect, and $15/month Studio,
// are settled planning; 14-day refund hold was a proposal. None of that is
// live collection or billing work on this branch.

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
  /games send none/i,
  /counts are not shared/i,
  /never collect a child's name/i,
  /share link can set a short cookie/i,
  /ordinary play or the grown-up challenge/i,
  /name: "Kide parent"/,
  /Notify me about new Pip the Sprout concept packs/,
  /need: ['"]Email me when a new pack lands['"]/,
  /need: ['"]Email me when family play opens['"]/,
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
  assert.match(page, /It lasts 15 minutes and belongs to the email that signed in/);
  assert.match(page, /not, by itself, proof of a payment/);
  assert.match(page, /not a promise that every old sign-in row is wiped/);
  assert.equal(/automatic(?:ally)? (?:purge|delete) (?:all |every )?expired/i.test(page), false);
  assert.match(page, /device cookie/);
  assert.match(page, /before family play is paid/);
  assert.match(page, /today's play minutes/);
  assert.match(page, /cookie for 30 days/);
  assert.match(page, /practice timing/);
  assert.match(page, /which item, which skill, how long/);
  assert.match(page, /ordinary play/);
  assert.match(page, /grown-up challenge keeps its own weekly score/);
  assert.match(page, /does not add those taps to those rows/);
  assert.match(page, /practice record/);
  assert.match(page, /child's age in years/);
  assert.match(page, /gift card can put a name in the link/);
  assert.match(page, /Opening the link shows that name on the page/);
  assert.match(page, /notify forms send the email they typed/);
  assert.match(page, /do not send a name or a reason unless someone types those in/);
  assert.match(page, /weekly board/);
  assert.match(page, /Delete everything on the parent page/);
  assert.match(page, /game progress, companion, age, and listening permission/);
  assert.match(page, /does not wipe today's free-play minutes/);
  assert.match(page, /does not claim to wipe every server row/);
  assert.match(page, /We do not ask for a child's name on the parent account/);
  assert.match(page, /not a promise that no name can ever be typed/);
  assert.equal(/\$15\/month|Lesson Studio|studio_monthly|we delete after \d+ days|retained for \d+ days/i.test(page), false);
  assert.equal(/We store only answer timing/i.test(page), false);
  assert.equal(/the only cookie this site sets/i.test(page), false);
  assert.equal(/games send none|counts are not shared|never collect a child's name/i.test(page), false);
  assert.equal(/play_day|gate_day|\/api\/funnel|2-day email hash|\/api\/studio\/clear/i.test(page), false);
  assert.match(page, /Play on this phone can also keep practice timing/);
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
  assert.match(parent, /Anyone with\s+the link can open it/);
  assert.match(parent, /Anyone who opens it sees that name on the page/);
  assert.equal(/not sent to us or stored anywhere/i.test(parent), false);
  assert.equal(/we never see it/i.test(parent), false);
  assert.match(parent, /Profile\.clear\(\)/);
  assert.match(parent, /Consent\.revoke\(\)/);
  assert.match(parent, /render\(\);\s*renderMic\(\);/);
  assert.match(parent, /pip_ttf_progress_v1/);
  assert.match(parent, /kide_voice_prefs_v1/);
  assert.match(parent, /Today\\'s free minutes stay so Pip\\'s timer still works/);
  assert.match(unlock, /already keeps today's free minutes/);
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
  assert.match(parent, /does not wipe today's free-play minutes/);
});

t('notify forms send the typed email and do not invent a name or reason', () => {
  const play = readFileSync('public/play/index.html', 'utf8');
  const parent = readFileSync('public/parent/index.html', 'utf8');
  const unlock = readFileSync('public/unlock/parent.js', 'utf8');
  assert.equal(/name:\s*"Kide parent"/.test(play), false);
  assert.equal(/Notify me about new Pip/.test(play), false);
  assert.equal(/Email me when a new pack lands/.test(parent), false);
  assert.equal(/Email me when family play opens/.test(unlock), false);
  assert.match(play, /email:\s*email/);
  assert.match(parent, /email,/);
  assert.match(unlock, /email: address/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
