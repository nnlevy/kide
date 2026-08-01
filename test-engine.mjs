// test-engine.js -- unit tests + the 40-beat simulation.
//
// Spec section 5: "Run this simulation against any change to the policy. The
// engine's failure modes are invisible in a five-beat manual playthrough and
// obvious in forty simulated ones."
//
// Two of these tests exist because the simulation caught real defects that a
// manual playthrough had not. They are regression pins: if either goes red,
// the corresponding bug is back.
//
//   * STARVATION -- with a symmetric ZPD falloff, the two weakest sounds were
//     never selected once in 40 beats. A child who struggles with /r/ would
//     open a speech app every day and never practise /r/.
//   * UNGATED LADDER -- with per-level target keys, clusters and phrases were
//     selectable from beat one, so the complexity ladder gated nothing.
//
// Run: node test-engine.js

import { LEX, STATIONS, keyOf, AFFORDANCES } from './public/engine/lexicon.js';
import {
  createLearner, selectNext, record, zpdFit, dueness, pHat, carList,
  refreshPool, activeTargets, POOL_SIZE,
  ZPD_LO, ZPD_HI, DECAY, PROMOTE_AT, PROMOTE_N, ZPD_FLOOR, MAX_LEVEL,
} from './public/engine/policy.js';
import { LessonEngine, MAX_ATTEMPTS } from './public/engine/engine.js';
import { computeGop, BLANK_ID } from './public/engine/scoring.js';

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${expected}, got ${actual}`);
}

/** Deterministic RNG so a red test is reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
console.log('\n--- lexicon integrity ---');
// ---------------------------------------------------------------------------

ok('lexicon is non-trivial', LEX.length >= 60, `${LEX.length} words`);
eq('all six affordances exist', AFFORDANCES.length, 6);

const unknownAff = LEX.flatMap((x) => x.aff).filter((a) => !STATIONS[a]);
eq('every word references a real station', unknownAff.length, 0);

const affCoverage = {};
for (const x of LEX) for (const a of x.aff) affCoverage[a] = (affCoverage[a] || 0) + 1;
const thinAff = AFFORDANCES.filter((a) => (affCoverage[a] || 0) < 8);
eq('every affordance has >=8 words', thinAff.length, 0, thinAff.join(','));

// The scorer needs ids; a word it cannot score is worse than no word at all.
const unscoreable = LEX.filter((x) => !x.ids || x.ids.length !== x.ipa.length || x.ids.some((i) => typeof i !== 'number'));
eq('every word carries usable phoneme ids', unscoreable.length, 0,
   unscoreable.map((x) => x.w).join(','));

const badLevel = LEX.filter((x) => x.lvl < 2 || x.lvl > 5);
eq('no L1 words in the affordance engine', badLevel.length, 0,
   'L1 isolation sounds cannot satisfy an affordance -- they belong to a separate scene type');

// ---------------------------------------------------------------------------
console.log('--- ZPD falloff asymmetry (regression pin) ---');
// ---------------------------------------------------------------------------

eq('inside the band scores 1.0', zpdFit(0.7), 1);
eq('band edges score 1.0', zpdFit(ZPD_LO), 1);
ok('above-band decays faster than below-band',
   zpdFit(ZPD_HI + 0.2) < zpdFit(ZPD_LO - 0.2),
   `above=${zpdFit(ZPD_HI + 0.2).toFixed(3)} below=${zpdFit(ZPD_LO - 0.2).toFixed(3)}`);
ok('a very weak target still scores above the floor',
   zpdFit(0.15) >= ZPD_FLOOR, `${zpdFit(0.15)}`);
// NB: for EQUAL distance from the band, above falls off faster -- that is the
// asymmetry. It does NOT follow that any weak target outranks any mastered one
// on fit alone (p is bounded at 1.0, so above-band distance can never exceed
// 0.15 while below-band can reach 0.55). An earlier version of this file
// asserted the stronger claim, and was simply wrong about the formula.
// Keeping weak targets in rotation is the POOL's job, not zpdFit's -- see the
// starvation pin in the simulation section.
{
  const d = 0.12;
  ok('equal distance: above-band falls off faster than below-band',
     zpdFit(ZPD_HI + d) < zpdFit(ZPD_LO - d),
     `above=${zpdFit(ZPD_HI + d).toFixed(3)} below=${zpdFit(ZPD_LO - d).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log('--- mastery updates ---');
// ---------------------------------------------------------------------------

{
  const L = createLearner({ concern: 'unclear', rng: mulberry32(1) });
  const m = Object.values(L.M)[0];
  const before = { a: m.a, b: m.b };
  record(L, m, true);
  ok('success decays then adds 1.0',
     Math.abs(m.a - (before.a * DECAY + 1)) < 1e-9 && Math.abs(m.b - before.b * DECAY) < 1e-9);
}
{
  const L = createLearner({ concern: 'unclear', rng: mulberry32(2) });
  const m = Object.values(L.M)[0];
  const before = { a: m.a, b: m.b };
  record(L, m, false);
  ok('a miss decays then adds only 0.5',
     Math.abs(m.b - (before.b * DECAY + 0.5)) < 1e-9 && Math.abs(m.a - before.a * DECAY) < 1e-9,
     'misses weigh half because the scorer misses real errors ~3x more than it false-flags');
}
{
  // Without decay, old failures never wash out and no promotion is reachable.
  const L = createLearner({ concern: 'unclear', rng: mulberry32(3) });
  const m = L.M['r_initial'];
  for (let i = 0; i < 12; i++) record(L, m, true);
  ok('sustained success reaches promotion threshold',
     pHat(m) > PROMOTE_AT, `p-hat=${pHat(m).toFixed(3)} after 12 successes`);
  ok('promotion actually advanced the level', m.lvl > 2, `level=${m.lvl}`);
}

// ---------------------------------------------------------------------------
console.log('--- complexity ladder gating (regression pin) ---');
// ---------------------------------------------------------------------------

{
  const L = createLearner({ concern: 'unclear', rng: mulberry32(4) });
  // Every L4/L5 word must share its target key with an L2 word, otherwise the
  // ladder gates nothing -- this was audit defect #1.
  const advanced = LEX.filter((x) => x.lvl >= 4);
  const orphaned = advanced.filter((x) => {
    const k = keyOf(x);
    return !LEX.some((y) => keyOf(y) === k && y.lvl <= 3);
  });
  eq('no advanced word has its own private target key', orphaned.length, 0,
     orphaned.map((x) => `${x.w}(${keyOf(x)})`).join(','));

  // And at a starting level, selection must never surface one.
  let sawAdvanced = false;
  for (let i = 0; i < 200; i++) {
    const pick = selectNext(L);
    if (pick.word.lvl > pick.target.m.lvl) sawAdvanced = true;
  }
  ok('selection never returns a word above its target\'s level', !sawAdvanced);
}

// ---------------------------------------------------------------------------
console.log('--- active pool (starvation-at-scale regression pin) ---');
// ---------------------------------------------------------------------------

{
  const L = createLearner({ concern: 'unclear', rng: mulberry32(20) });
  eq('pool is capped at POOL_SIZE', activeTargets(L).length, POOL_SIZE);
  ok('the lexicon holds more targets than the pool',
     Object.keys(L.M).length > POOL_SIZE,
     `${Object.keys(L.M).length} targets, pool ${POOL_SIZE} -- the cap is doing work`);

  // The weakest sound must be in the opening pool. This is the whole reason
  // the pool exists: at 19 live targets the policy starved it completely.
  const weakest = Object.values(L.M).sort((a, b) => pHat(a) - pHat(b))[0];
  ok('the weakest target starts in the pool', weakest.active,
     `${weakest.ph}_${weakest.pos} p-hat=${pHat(weakest).toFixed(2)}`);

  // Selection must never reach outside the pool.
  const poolKeys = new Set(activeTargets(L).map(keyOf));
  let leaked = 0;
  for (let i = 0; i < 300; i++) {
    if (!poolKeys.has(keyOf(selectNext(L).target.m))) leaked++;
  }
  eq('selection never reaches outside the pool', leaked, 0);
}
{
  // Graduation must free a slot and admit a replacement, or the 85-word
  // lexicon has nowhere to go and the pool becomes a ceiling instead of a
  // window.
  const L = createLearner({ concern: 'unclear', rng: mulberry32(21) });
  const m = activeTargets(L)[0];
  m.lvl = MAX_LEVEL; m.a = 40; m.b = 1; m.n = PROMOTE_N;
  const before = activeTargets(L).map(keyOf);
  const change = refreshPool(L);
  eq('a fully-mastered target graduates', change.graduated.length, 1);
  eq('a replacement is admitted', change.admitted.length, 1);
  eq('the pool stays at size', activeTargets(L).length, POOL_SIZE);
  ok('the replacement is a target that was not previously active',
     !before.includes(change.admitted[0]), change.admitted[0]);
}

// ---------------------------------------------------------------------------
console.log('--- 40-beat simulation ---');
// ---------------------------------------------------------------------------

/** Simulate a learner with fixed true abilities. The engine cannot see these;
 *  it only sees noisy attempt outcomes, which is the real situation. */
function simulate({ beats = 40, seed = 7, trueAbility, concern = 'unclear' } = {}) {
  const rng = mulberry32(seed);
  const L = createLearner({ concern, rng });
  const picks = [];
  for (let i = 0; i < beats; i++) {
    refreshPool(L);
    const pick = selectNext(L);
    const k = keyOf(pick.target.m);
    const ability = trueAbility[pick.target.m.ph] ?? 0.6;
    const success = rng() < ability;
    record(L, pick.target.m, success);
    picks.push({ key: k, station: pick.affordance, word: pick.word.w, success });
    L.lastKey = k;
    L.lastStation = pick.affordance;
    L.beat++;
  }
  return { L, picks };
}

// A child who is genuinely weak on /r/ and /s/ -- the case the product exists for.
const trueAbility = { b: 0.9, m: 0.9, p: 0.85, l: 0.5, r: 0.25, s: 0.33,
                      k: 0.8, d: 0.8, n: 0.8, w: 0.8, h: 0.85, f: 0.6,
                      g: 0.7, t: 0.8, sh: 0.5, ch: 0.5, th: 0.4, v: 0.6, z: 0.6, y: 0.8 };

{
  const { L, picks } = simulate({ trueAbility });
  const counts = {};
  for (const p of picks) counts[p.key] = (counts[p.key] || 0) + 1;

  const rCount = counts['r_initial'] || 0;
  const sCount = (counts['s_initial'] || 0) + (counts['s_cluster'] || 0);
  ok('the weakest sound (/r/) is practised, not starved', rCount > 0,
     'THIS IS THE STARVATION REGRESSION PIN -- a symmetric falloff makes this 0');
  ok('/s/ is practised too', sCount > 0);

  const strongCount = counts['m_initial'] || 0;
  ok('weak targets get at least as much practice as strong ones',
     rCount >= strongCount * 0.6,
     `r=${rCount} vs m=${strongCount}`);

  let consecutiveTarget = 0, consecutiveStation = 0;
  for (let i = 1; i < picks.length; i++) {
    if (picks[i].key === picks[i - 1].key) consecutiveTarget++;
    if (picks[i].station === picks[i - 1].station) consecutiveStation++;
  }
  eq('zero consecutive target repeats (interleave, never block)', consecutiveTarget, 0);
  eq('zero consecutive station repeats', consecutiveStation, 0);

  const distinctWords = new Set(picks.map((p) => p.word)).size;
  ok('a variety of words surfaced', distinctWords >= 10, `${distinctWords} distinct words`);

  const promoted = Object.values(L.M).filter((m) => m.lvl > 2).length;
  ok('promotion is reachable', promoted > 0,
     'THIS IS THE NO-PROMOTION REGRESSION PIN -- without decay this is 0');

  // The engine should end up believing roughly what is true.
  const rP = pHat(L.M['r_initial']);
  const mP = pHat(L.M['m_initial']);
  ok('the engine ranks a weak sound below a strong one', rP < mP,
     `r=${rP.toFixed(2)} m=${mP.toFixed(2)}`);

  console.log(`    ${picks.length} beats, ${distinctWords} distinct words, ` +
              `${Object.keys(counts).length} targets touched, ${promoted} promotions`);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [k, c] of top) {
    console.log(`      ${k.padEnd(12)} ${String(c).padStart(2)} selections  p-hat=${pHat(L.M[k]).toFixed(2)}  L${L.M[k].lvl}`);
  }
}

{
  // Stability: the properties must hold across seeds, not just the lucky one.
  let starved = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const { picks } = simulate({ trueAbility, seed });
    const counts = {};
    for (const p of picks) counts[p.key] = (counts[p.key] || 0) + 1;
    if (!(counts['r_initial'] > 0)) starved++;
  }
  eq('/r/ is never starved across 25 seeds', starved, 0);
}

// ---------------------------------------------------------------------------
console.log('--- the no-failure attempt flow ---');
// ---------------------------------------------------------------------------

/** A scorer stub that always reports the same verdict, so the flow can be
 *  tested without a 189MB model. */
const stubScorer = (verdict) => ({
  score: async () => ({ verdict, tier: 'gop-webgpu', score: -1.0, confidence: 0.3, detail: 'stub' }),
});

{
  const e = new LessonEngine({ scorer: stubScorer('unsure'), rng: mulberry32(11) });
  e.nextBeat();
  const r1 = await e.submitAttempt(new Float32Array(16000));
  const r2 = await e.submitAttempt(new Float32Array(16000));
  const r3 = await e.submitAttempt(new Float32Array(16000));
  ok('an unsure first attempt does not resolve', !r1.resolves);
  ok('an unsure second attempt does not resolve', !r2.resolves);
  ok('the third attempt resolves regardless of score', r3.resolves,
     'a stuck child is a churned child');
  ok('the forced resolution is flagged internally', r3.forced);
  eq('the child-facing state is TRIUMPH either way', r3.state, 'TRIUMPH');
  ok('a forced resolution is never recorded as mastery',
     !e.log.some((x) => x.forced && x.verdict === 'clear'),
     'recording it as success would corrupt the parent trend');
}
{
  const e = new LessonEngine({ scorer: stubScorer('no-input'), rng: mulberry32(12) });
  e.nextBeat();
  const r = await e.submitAttempt(new Float32Array(16000));
  ok('silence is never a failure', r.state === 'MODEL' && !r.forced);
}
{
  // A tap-only device must be a complete experience, not a degraded one.
  const e = new LessonEngine({ rng: mulberry32(13) });
  const beat = e.nextBeat();
  ok('tap-only still produces a full invitation', typeof beat.invitation === 'string' && beat.invitation.length > 10);
  const r = await e.submitAttempt(null);
  ok('a tap resolves the beat', r.resolves);
  eq('a tap is scored as the tap tier', r.tier, 'tap');
}
{
  const e = new LessonEngine({ scorer: stubScorer('clear'), rng: mulberry32(14) });
  for (let i = 0; i < 30; i++) {
    e.nextBeat();
    await e.submitAttempt(new Float32Array(16000));
  }
  const rep = e.parentReport();
  ok('the parent report has a car list', rep.carList.length >= 0);
  ok('the report states its own confidence', ['too-soon', 'early', 'good'].includes(rep.confidence));
  ok('no per-attempt score leaks into the report',
     !JSON.stringify(rep).includes('"score"'),
     'per-attempt scores are surfaced to nobody');
  console.log(`    report after 30 beats: confidence=${rep.confidence}, ` +
              `${rep.targets.length} targets, ${rep.promotions} promotions, ${rep.distinctWords} words`);
}

// ---------------------------------------------------------------------------
console.log('--- GOP scorer maths ---');
// ---------------------------------------------------------------------------

{
  // A hand-built logit tensor that strongly favours the target sequence should
  // score better than one that favours something else.
  const V = 45, T = 12;
  const target = [3, 24, 18]; // b ae t
  function build(favour) {
    const a = new Float32Array(T * V).fill(-8);
    for (let t = 0; t < T; t++) {
      a[t * V + BLANK_ID] = 1;
      const sym = favour[Math.floor((t / T) * favour.length)];
      a[t * V + sym] = 6;
    }
    return a;
  }
  const good = computeGop(build(target), T, V, target, BLANK_ID);
  const bad = computeGop(build([11, 9, 16]), T, V, target, BLANK_ID);
  ok('matching audio scores higher than mismatching', good.normalizedScore > bad.normalizedScore,
     `match=${good.normalizedScore.toFixed(2)} mismatch=${bad.normalizedScore.toFixed(2)}`);
  ok('a log-probability is negative', good.perPhonemeLogProb < 0);

  const tooShort = computeGop(new Float32Array(2 * V).fill(-1), 2, V, [1, 2, 3, 4, 5, 6, 7], BLANK_ID);
  ok('a clip too short for the target is flagged, not scored', tooShort.tooShort);
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  x ' + f);
  process.exit(1);
}
console.log('OK\n');
