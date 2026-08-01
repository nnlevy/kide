// test-speech.mjs -- Pip must never be cut off mid-sentence.
//
// THE BUG, and why it is a class rather than an incident.
//
// Two call sites started an audio clip and then advanced the game on a fixed
// `setTimeout(..., 900)`. `speak()` begins with `stopSpeaking()`, so the next
// question's prompt truncated the previous line. Against the shipped voice
// pack, NINE OF FIFTEEN affirm/answer/retry clips are longer than 900ms (the
// longest is 3.10s), so Pip was cut off on roughly 60% of them. It surfaced as
// "Pip only says the first word of the follow-up", which is exactly what a
// truncated clip sounds like.
//
// The root cause is structural: CLIP LENGTH IS DATA, NOT CODE. A fixed timer
// can never be correct, and re-recording the voice pack would silently change
// the failure rate without touching a line of source.
//
// This suite guards it three ways, none of which needs a browser -- the /play
// page cannot be rendered in this sandbox (verified: the committed version
// crashes headless Chromium here too), and a guard that only runs somewhere
// else is not a guard.
//
//   1. the real afterSpeech() implementation, lifted out of the page and
//      executed, so its actual timing semantics are checked;
//   2. a static scan for the bug pattern anywhere in the codebase;
//   3. a check against real clip durations, so the numbers in (1) are
//      calibrated to the voice pack that actually ships.
//
// Run: npm run test:speech

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; failures.push(`${n}${d ? ' -- ' + d : ''}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b}, got ${a}`);

const PLAY = fs.readFileSync('./public/play/index.html', 'utf8');

// ---------------------------------------------------------------------------
console.log('\n--- afterSpeech(): the real implementation, executed ---');
// ---------------------------------------------------------------------------

// Lift the function out of the page rather than reimplementing it -- a test of
// a copy proves nothing about what ships.
const src = /function afterSpeech\(speech, minMs, maxMs\)\{[\s\S]*?\n\}/.exec(PLAY);
ok('afterSpeech exists in the page', !!src);

// Its constants must be lifted with it -- the ceiling is derived from
// SPEAK_MAX_MS rather than hard-coded, which is the whole point.
const consts = [...PLAY.matchAll(/^var (SPEAK_MAX_MS|SPEECH_CEILING_MS)\s*=\s*[^;]+;/gm)].map((m) => m[0]);
ok('the ceiling constants are declared', consts.length === 2, consts.join(' '));

let afterSpeech = null;
if (src && consts.length === 2) {
  // eslint-disable-next-line no-new-func
  afterSpeech = new Function(`${consts.join('\n')}\n${src[0]}; return afterSpeech;`)();
  ok('afterSpeech is callable', typeof afterSpeech === 'function');
}

const settled = (p) => { let done = false; p.then(() => { done = true; }); return () => done; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const speechTaking = (ms) => new Promise((r) => setTimeout(() => r(true), ms));

if (afterSpeech) {
  {
    // The reported bug: a 2.6s clip must not be cut short by a 900ms floor.
    const isDone = settled(afterSpeech(speechTaking(2600), 900));
    await wait(1400);
    ok('does NOT resolve while a long clip is still playing', !isDone(),
       'this is the exact failure: the old code advanced at 900ms into a 3.10s clip');
    await wait(1500);
    ok('resolves once the clip finishes', isDone());
  }
  {
    // A very short clip still gets a beat, so the game does not snap onward.
    const isDone = settled(afterSpeech(speechTaking(50), 900));
    await wait(400);
    ok('a short clip still waits for the minimum beat', !isDone());
    await wait(700);
    ok('and then resolves', isDone());
  }
  {
    // A stalled or blocked clip must never freeze the game. A frozen screen is
    // worse for a child than a clipped word.
    const isDone = settled(afterSpeech(new Promise(() => {}), 900, 1200));
    await wait(700);
    ok('a never-resolving clip has not released early', !isDone());
    await wait(900);
    ok('the ceiling releases a stalled clip', isDone(),
       'afterSpeech must cap the wait -- speak() also self-resolves at 9s');
  }
  {
    const isDone = settled(afterSpeech(Promise.resolve(true), 0));
    await wait(30);
    ok('zero floor with an instant clip resolves promptly', isDone());
  }
}

// ---------------------------------------------------------------------------
console.log('--- the bug pattern must not reappear anywhere ---');
// ---------------------------------------------------------------------------

{
  // Strip comments so the prose describing the bug does not trip its own guard.
  const code = PLAY
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // The signature of the bug: a say()/speak() whose promise is dropped, with a
  // bare setTimeout advancing the game right after it.
  const lines = code.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const speaks = /(?<![.\w])(say|speak)\s*\(/.test(l) && !/function\s+(say|speak)/.test(l);
    if (!speaks) continue;
    const chained = /\.then\s*\(|afterSpeech\s*\(|return\s|=\s*(say|speak)\s*\(|const\s+\w+\s*=/.test(l);
    if (chained) continue;
    // fire-and-forget is fine UNLESS something advances the screen right after
    const window3 = lines.slice(i, i + 3).join(' ');
    if (/setTimeout\s*\(\s*(\(\)|function)\s*=?>?[^)]*\b(newQuestion|render|nextBeat|advance)\b/.test(window3)) {
      offenders.push(`L${i + 1}: ${l.trim().slice(0, 70)}`);
    }
  }
  eq('no fire-and-forget speech followed by a state-advancing timer', offenders.length, 0,
     offenders.join(' | '));

  // And the specific historical form, spelled out so a future reader knows it.
  ok('no setTimeout(..., <literal>) advances the question',
     !/setTimeout\s*\(\s*\(\)\s*=>\s*\{[^}]*newQuestion[^}]*\}\s*,\s*\d+\s*\)/.test(code),
     'this exact shape shipped the bug');
}

// ---------------------------------------------------------------------------
console.log('--- calibrated against the voice pack that actually ships ---');
// ---------------------------------------------------------------------------

{
  // The floors in the page are only defensible relative to real clip lengths.
  let durations = [];
  try {
    for (const f of fs.readdirSync('./public/voice/v1').filter((f) => f.endsWith('.mp3'))) {
      const out = execFileSync('ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `./public/voice/v1/${f}`],
        { encoding: 'utf8' }).trim();
      const d = parseFloat(out);
      if (!Number.isNaN(d)) durations.push({ id: f.replace('.mp3', ''), d });
    }
  } catch { /* ffprobe unavailable -- covered by the checks above */ }

  if (!durations.length) {
    console.log('    (ffprobe unavailable; clip-length calibration skipped)');
  } else {
    const praise = durations.filter((x) => /^(affirm|answer|retry)-/.test(x.id));
    const longest = praise.reduce((a, b) => (b.d > a.d ? b : a), praise[0]);
    const overOldTimer = praise.filter((x) => x.d > 0.9).length;

    ok('the voice pack is present', praise.length > 0, `${praise.length} praise clips`);
    ok('the historical 900ms timer really was too short',
       overOldTimer > 0,
       `${overOldTimer}/${praise.length} praise clips exceed 900ms; longest ${longest.id} at ${longest.d.toFixed(2)}s`);
    console.log(`    ${overOldTimer}/${praise.length} praise clips exceed the old 900ms timer `
      + `(longest: ${longest.id} ${longest.d.toFixed(2)}s)`);

    // The ceiling must clear the longest line in the whole pack, or a genuine
    // clip could be cut by the safety valve itself.
    const longestAny = durations.reduce((a, b) => (b.d > a.d ? b : a), durations[0]);
    const ceilings = [...PLAY.matchAll(/afterSpeech\([^)]*?,\s*(\d+)\s*,\s*(\d+)\s*\)/g)].map((m) => Number(m[2]));
    const declared = /SPEECH_CEILING_MS\s*=\s*SPEAK_MAX_MS\s*\+\s*(\d+)/.exec(PLAY);
    const speakMax = /SPEAK_MAX_MS\s*=\s*(\d+)/.exec(PLAY);
    const defaultCeiling = declared && speakMax
      ? Number(speakMax[1]) + Number(declared[1]) : 6000;
    const minCeiling = ceilings.length ? Math.min(...ceilings, defaultCeiling) : defaultCeiling;
    ok('the ceiling clears the longest clip in the pack',
       minCeiling > longestAny.d * 1000,
       `ceiling ${minCeiling}ms vs longest clip ${longestAny.id} ${longestAny.d.toFixed(2)}s`);
    console.log(`    ceiling ${minCeiling}ms clears the longest clip `
      + `(${longestAny.id} ${longestAny.d.toFixed(2)}s) by ${(minCeiling - longestAny.d * 1000).toFixed(0)}ms`);

    // The ceiling is only meaningful if speak() itself is guaranteed to settle
    // first; otherwise the two safety nets are independent guesses.
    const voice = fs.readFileSync('./public/voice.js', 'utf8');
    const speakSelfResolve = /opts\.maxMs\s*\|\|\s*(\d+)/.exec(voice);
    ok('voice.js speak() self-resolves', !!speakSelfResolve);
    if (speakSelfResolve && speakMax) {
      eq('SPEAK_MAX_MS matches voice.js', Number(speakMax[1]), Number(speakSelfResolve[1]));
    }
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  x ' + f); process.exit(1); }
console.log('OK\n');
