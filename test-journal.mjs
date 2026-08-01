// test-journal.mjs -- durable evidence, and the privacy it has to keep.
//
// The clinical layer was a demo until this existed: evidence that only lives in
// memory is not evidence. Adherence -- the number nobody else in this category
// can produce -- is ENTIRELY a function of history, so a month of it has to
// survive a browser restart.
//
// The assertions that matter most here are the privacy ones. This store is
// where the product's defining promise is kept or lost, and "we just won't
// write audio" is a convention, not a guarantee. The allow-list is enforced on
// write and asserted here.
//
// Run: npm run test:journal

import fs from 'node:fs';

// Minimal localStorage so the module under test runs unchanged in node --
// testing a different code path than the one that ships would prove nothing.
class MemoryStorage {
  constructor(limit = Infinity) { this.map = new Map(); this.limit = limit; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (String(v).length > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new MemoryStorage();

const J = await import('./public/engine/journal.js');

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; failures.push(`${n}${d ? ' -- ' + d : ''}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b}, got ${a}`);

const T0 = Date.parse('2026-07-01T09:00:00Z');
const ev = (o = {}) => ({ at: T0, target: 'r_initial', word: 'rope', tier: 'native',
                          verdict: 'clear', forced: false, level: 2, surface: 'play', ...o });

// ---------------------------------------------------------------------------
console.log('\n--- it actually persists ---');
// ---------------------------------------------------------------------------

J.clear();
eq('starts empty', J.count(), 0);
ok('a record is written', J.record(ev()));
eq('and is readable', J.count(), 1);

{
  // The point of the whole file: a fresh module instance must see prior events.
  // Re-importing with a cache-buster is the closest node equivalent of a reload.
  const J2 = await import(`./public/engine/journal.js?reload=${Date.now()}`);
  eq('a reload still sees the history', J2.count(), 1,
     'evidence that does not survive a restart is not evidence');
}

{
  J.clear();
  for (let i = 0; i < 5; i++) J.record(ev({ at: T0 + i * 60000 }));
  const all = J.all();
  eq('all() returns everything', all.length, 5);
  ok('oldest first', all[0].at < all[4].at);
  ok('all() is a copy, not the live array', (all.push({}), J.count() === 5));
}

// ---------------------------------------------------------------------------
console.log('--- privacy: the allow-list is enforced, not assumed ---');
// ---------------------------------------------------------------------------

{
  J.clear();
  J.record(ev({
    audio: new Array(100).fill(0.5),
    pcm: 'AAAA', waveform: [1, 2, 3], embedding: [0.1, 0.2],
    voiceprint: 'xyz', recording: 'blob:...',
    childName: 'Ada', email: 'a@b.c', dob: '2021-04-02', address: '1 Road', ip: '1.2.3.4',
  }));
  const stored = JSON.stringify(J.all());
  for (const f of J.FORBIDDEN_FIELDS) {
    ok(`"${f}" is never persisted`, !stored.includes(f),
       'the amended COPPA Rule lists voiceprints as biometric personal information');
  }
  ok('no audio-shaped payload survives', !/0\.5,0\.5,0\.5/.test(stored));
  const keys = Object.keys(J.all()[0]);
  ok('only allow-listed fields remain', keys.every((k) => J.ALLOWED_FIELDS.includes(k)), keys.join(','));

  // An allow-list fails safe; a deny-list fails open. Assert it is the former:
  // a field nobody anticipated must also be dropped.
  J.clear();
  J.record(ev({ someFutureFieldNobodyThoughtOf: 'leak' }));
  ok('an unanticipated field is dropped too', !JSON.stringify(J.all()).includes('leak'),
     'this is why it is an allow-list and not a block-list');
}

{
  J.clear();
  ok('an event with no target is refused', !J.record({ tier: 'tap', at: T0 }));
  ok('an event with no tier is refused', !J.record({ target: 'r_initial', at: T0 }));
  eq('nothing was written', J.count(), 0);
  ok('junk input never throws', J.record(null) === false && J.record(undefined) === false
     && J.record('nope') === false && J.record(42) === false);
}

// ---------------------------------------------------------------------------
console.log('--- a parent can delete everything ---');
// ---------------------------------------------------------------------------

{
  J.clear();
  for (let i = 0; i < 20; i++) J.record(ev({ at: T0 + i * 60000 }));
  ok('there is something to delete', J.count() === 20);
  J.clear();
  eq('clear() removes everything', J.count(), 0);
  eq('and it is gone from storage too', localStorage.getItem(J.JOURNAL_KEY), null,
     'a parent deleting their child\'s record is an obligation, not a feature');
}

// ---------------------------------------------------------------------------
console.log('--- it cannot grow without bound, or break the game ---');
// ---------------------------------------------------------------------------

{
  J.clear();
  const over = J.MAX_EVENTS + 250;
  for (let i = 0; i < over; i++) J.record(ev({ at: T0 + i * 1000 }));
  eq('capped at MAX_EVENTS', J.count(), J.MAX_EVENTS);
  const all = J.all();
  ok('the OLDEST were dropped, not the newest', all[all.length - 1].at === T0 + (over - 1) * 1000,
     'recent history is what a clinician reads');
}
{
  // Storage full: the game must keep working and keep recording.
  const prev = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage(400);      // absurdly small
  const J3 = await import(`./public/engine/journal.js?quota=${Date.now()}`);
  let threw = false;
  try { for (let i = 0; i < 50; i++) J3.record(ev({ at: T0 + i * 1000 })); } catch { threw = true; }
  ok('a full quota never throws', !threw, 'a crash here would take the game down with it');
  ok('and recording still reports state', typeof J3.count() === 'number');
  globalThis.localStorage = prev;
}
{
  // Storage unavailable entirely (private mode). Degrade, never fail.
  const prev = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError'); },
  });
  let J4 = null, threw = false;
  try { J4 = await import(`./public/engine/journal.js?nostore=${Date.now()}`); }
  catch { threw = true; }
  ok('the module loads with storage disabled', !threw && !!J4);
  if (J4) {
    ok('storageAvailable() reports honestly', J4.storageAvailable() === false);
    ok('and it still records in memory', J4.record(ev()) === true,
       'this session is still worth something, even if it will not survive');
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev, writable: true });
}
{
  // Corrupt or future-version data must not be interpreted.
  globalThis.localStorage.setItem(J.JOURNAL_KEY, '{"v":999,"events":[{"target":"x","tier":"tap"}]}');
  const J5 = await import(`./public/engine/journal.js?ver=${Date.now()}`);
  eq('an unknown schema version is ignored', J5.count(), 0,
     'better empty than numbers derived from something we cannot interpret');
  globalThis.localStorage.setItem(J.JOURNAL_KEY, 'not json at all');
  const J6 = await import(`./public/engine/journal.js?bad=${Date.now()}`);
  eq('corrupt storage is ignored', J6.count(), 0);
  globalThis.localStorage.removeItem(J.JOURNAL_KEY);
}

// ---------------------------------------------------------------------------
console.log('--- the whole chain: journal -> clinical record ---');
// ---------------------------------------------------------------------------

{
  const { buildRecord } = await import('./public/engine/clinical.js');
  J.clear();
  // 14 days, spoken practice, plus taps that must not count as speech.
  for (let d = 0; d < 14; d++) {
    for (let i = 0; i < 6; i++) {
      J.record(ev({ at: T0 + d * 86400000 + i * 60000,
                    verdict: d > 6 ? 'clear' : 'unsure', tier: 'native' }));
    }
    J.record(ev({ at: T0 + d * 86400000 + 700000, tier: 'tap' }));
  }
  const rec = buildRecord(J.all(), { now: T0 + 14 * 86400000 });
  eq('every event reached the record', rec.totalAttempts, 14 * 7);
  eq('taps were excluded from speech', rec.excludedTaps, 14);
  eq('spoken attempts were counted', rec.scoredAttempts, 14 * 6);
  eq('adherence spans the real period', rec.adherence.days, 14);
  ok('a per-sound rate is produced', !!rec.targets[0].producedCorrectly);
  ok('a real improvement is detected end to end',
     rec.targets[0].trend.direction === 'improving', rec.targets[0].trend.direction);
}

// ---------------------------------------------------------------------------
console.log('--- the share link ---');
// ---------------------------------------------------------------------------

{
  J.clear();
  for (let i = 0; i < 10; i++) J.record(ev({ at: T0 + i * 3600000 }));
  const link = J.exportLink('/clinician/', { days: 90, now: T0 + 86400000 });
  ok('it points at the clinician surface', link.startsWith('/clinician/?data='));

  const b64 = decodeURIComponent(link.split('data=')[1]);
  const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  eq('the payload round-trips', decoded.length, 10);
  ok('and carries no audio or identity', !J.FORBIDDEN_FIELDS.some((f) => JSON.stringify(decoded).includes(f)));

  // A window means a window: older events must be excluded.
  J.record(ev({ at: T0 - 200 * 86400000 }));
  const windowed = J.exportLink('/clinician/', { days: 90, now: T0 + 86400000 });
  const got = JSON.parse(Buffer.from(decodeURIComponent(windowed.split('data=')[1]), 'base64').toString('utf8'));
  eq('events outside the window are excluded', got.length, 10);
}

// ---------------------------------------------------------------------------
console.log('--- the real game records the right thing ---');
// ---------------------------------------------------------------------------

{
  const play = fs.readFileSync('./public/play/index.html', 'utf8');
  const targets = JSON.parse(fs.readFileSync('./public/data/play-targets.json', 'utf8'));

  ok('the play surface records practice', /recordPractice\(/.test(play));
  ok('a spoken match is recorded as speech', /answerSource\s*=\s*"voice"/.test(play));
  ok('a tap is recorded as a tap, not speech', /source === "voice" \? "native" : "tap"/.test(play));
  ok('an unrecognised spoken attempt is still recorded',
     /onNoMatch[\s\S]{0,400}recordPractice/.test(play),
     'dropping them would bias the record upward by discarding attempts that went badly');

  ok('every play answer word maps to a target', Object.keys(targets).length >= 14);
  for (const [w, t] of Object.entries(targets)) {
    ok(`${w} carries a phoneme target`, /^[a-z]+_(initial|medial|final)$/.test(t.target), t.target);
    ok(`${w} has scoreable ids`, Array.isArray(t.ids) && t.ids.length === t.ipa.length);
  }
}

// ---------------------------------------------------------------------------
console.log('--- one microphone, one permission ---');
// ---------------------------------------------------------------------------

{
  const C = await import('./public/engine/consent.js');
  const voiceSrc = fs.readFileSync('./public/voice.js', 'utf8');

  // The record MUST be the one voice.js already owns. Two records would mean a
  // parent who revoked in one place still had a live microphone in the other,
  // with no way of knowing.
  const key = /CONSENT_KEY\s*=\s*"([^"]+)"/.exec(voiceSrc);
  const ver = /CONSENT_VERSION\s*=\s*(\d+)/.exec(voiceSrc);
  ok('voice.js declares a consent key', !!key);
  eq('consent.js shares voice.js\'s key', C.CONSENT_KEY, key ? key[1] : null);
  eq('and its version', C.CONSENT_VERSION, ver ? Number(ver[1]) : null);

  C.revoke();
  eq('starts ungranted', C.granted(), false);
  C.grant('ondevice');
  ok('grant records on-device mode', C.get().mode === 'ondevice');
  eq('and reads as granted', C.granted(), true);

  // A stale version must not inherit an old yes -- the policy it agreed to has
  // changed, so the question has to be asked again.
  localStorage.setItem(C.CONSENT_KEY, JSON.stringify({ granted: true, version: 999, mode: 'ondevice' }));
  eq('a stale consent version is not honoured', C.granted(), false);

  C.grant();
  C.revoke();
  eq('revoke is total', localStorage.getItem(C.CONSENT_KEY), null);
  eq('and reads as ungranted', C.granted(), false);
}

// ---------------------------------------------------------------------------
console.log('--- /words: listening is off until a grown-up says otherwise ---');
// ---------------------------------------------------------------------------

{
  const words = fs.readFileSync('./public/words/index.html', 'utf8');

  ok('scoring is gated on consent', /if \(!Consent\.granted\(\)\) return/.test(words),
     'a child must not be able to turn on their own microphone');
  ok('the mic button only exists when listening is genuinely available',
     /micReady\s*\?/.test(words));
  ok('tapping is always offered', /id="btnSaid"/.test(words));
  ok('a microphone failure falls through to a tap, silently',
     /catch \{[\s\S]{0,160}resolveAttempt\(null\)/.test(words),
     'a child must never be blocked, or blamed, by the microphone');

  // The promise the consent sheet makes has to be one the code keeps.
  const scoring = fs.readFileSync('./public/engine/scoring.js', 'utf8');
  ok('no cloud endpoint exists in the scorer',
     !/https?:\/\/(?!cdn\.jsdelivr)/.test(scoring.replace(/\/\*[\s\S]*?\*\//g, '')),
     'the sheet says there is no cloud option to switch on');
  ok('the sheet claims nothing is recorded', /Nothing is recorded and nothing is sent/.test(words));
  ok('and the journal cannot persist audio, so that claim holds',
     J.FORBIDDEN_FIELDS.includes('audio') && J.FORBIDDEN_FIELDS.includes('voiceprint'));

  // Never a failure state, even with a real scorer attached.
  ok('an unheard attempt re-invites rather than failing',
     /if \(!r\.resolves\)[\s\S]{0,220}MODEL/.test(words));
  // Check what is said TO A CHILD, not the whole file. An earlier version of
  // this assertion scanned everything and flagged two legitimate strings: the
  // code path name `p.phase === 'failed'`, and the parent-facing promise
  // "never told they got a word wrong" -- which is the very guarantee under
  // test. A guard that fires on its own subject matter is a bad guard.
  ok('the re-invite is warm, not corrective', /Let's try together/.test(words));
  {
    // Tolerant of extra arguments on purpose. say() gained a second argument
    // (how to SPEAK the line) and the old pattern -- which required the call to
    // close straight after the backtick -- silently matched nothing. A safety
    // check that quietly stops checking is worse than one that fails, which is
    // why the "are there any lines at all" guard below is not optional.
    const childLines = [...words.matchAll(/\.say\(\s*`([^`]*)`/g)].map((m) => m[1])
      .concat([...words.matchAll(/caption:\s*`([^`]*)`/g)].map((m) => m[1]))
      .concat([...words.matchAll(/caption:\s*'([^']*)'/g)].map((m) => m[1]));
    ok('the child is never told they were wrong',
       childLines.length > 0 && !childLines.some((l) => /wrong|incorrect|failed|no,|not quite right/i.test(l)),
       childLines.filter((l) => /wrong|incorrect|failed/i.test(l)).join(' | '));
    ok('there are child-facing lines to check at all', childLines.length >= 3,
       `${childLines.length} found`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  x ' + f); process.exit(1); }
console.log('OK\n');
