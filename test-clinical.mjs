// test-clinical.mjs -- the evidence layer.
//
// This suite guards the claims a clinician would rely on. Two of them would be
// invisible in a demo and indefensible in a clinic:
//
//   * a TAP is not speech, and counting one would inflate every rate on the
//     report -- most for the children who talk least, which is backwards;
//   * the policy's beta state is a deliberately biased CONTROL signal
//     (decayed, asymmetric) and must never reach an inference.
//
// Run: node test-clinical.mjs

import fs from 'node:fs';
import {
  buildRecord, narrativeFor, trendFor, adherenceFrom, jeffreysInterval,
  betaCDF, betaQuantile, METHOD_VERSION, MIN_ATTEMPTS_PER_TARGET,
  MIN_ATTEMPTS_FOR_TREND, CI_MASS,
} from './public/engine/clinical.js';
import { LessonEngine } from './public/engine/engine.js';

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; failures.push(`${n}${d ? ' -- ' + d : ''}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b}, got ${a}`);
const near = (n, a, b, tol = 1e-3) => ok(n, Math.abs(a - b) < tol, `${a} vs ${b}`);

const T0 = Date.parse('2026-07-01T09:00:00Z');
const ev = (o) => ({ target: 'r_initial', word: 'rope', tier: 'gop-webgpu',
                     forced: false, verdict: 'clear', level: 2, at: T0, ...o });

// ---------------------------------------------------------------------------
console.log('\n--- the statistics are actually correct ---');
// ---------------------------------------------------------------------------

// Beta CDF against values that can be checked by hand.
near('Beta(1,1) is uniform: CDF(0.5)=0.5', betaCDF(0.5, 1, 1), 0.5);
near('Beta(1,1) CDF(0.25)=0.25', betaCDF(0.25, 1, 1), 0.25);
near('Beta(2,1) CDF(x)=x^2 at 0.5', betaCDF(0.5, 2, 1), 0.25);
near('Beta(1,2) CDF(0.5)=0.75', betaCDF(0.5, 1, 2), 0.75);
near('Beta(2,2) is symmetric about 0.5', betaCDF(0.5, 2, 2), 0.5);
ok('CDF is monotonic', betaCDF(0.3, 3, 5) < betaCDF(0.6, 3, 5));

near('quantile inverts the CDF', betaCDF(betaQuantile(0.37, 4, 7), 4, 7), 0.37, 1e-4);
near('median of Beta(1,1) is 0.5', betaQuantile(0.5, 1, 1), 0.5, 1e-4);

{
  const ci = jeffreysInterval(5, 10);
  near('point estimate is the raw proportion', ci.point, 0.5);
  ok('interval brackets the point', ci.lo < ci.point && ci.point < ci.hi);
  ok('interval is inside [0,1]', ci.lo >= 0 && ci.hi <= 1);

  const wide = jeffreysInterval(5, 10), narrow = jeffreysInterval(50, 100);
  ok('more data gives a narrower interval', (narrow.hi - narrow.lo) < (wide.hi - wide.lo),
     `${(narrow.hi - narrow.lo).toFixed(3)} vs ${(wide.hi - wide.lo).toFixed(3)}`);

  // Wald would give a zero-width interval here, which is why it is not used.
  const edge = jeffreysInterval(0, 12);
  ok('0/12 still yields a non-degenerate upper bound', edge.hi > 0 && edge.hi < 1, `hi=${edge.hi}`);
  const edge2 = jeffreysInterval(12, 12);
  ok('12/12 still yields a non-degenerate lower bound', edge2.lo > 0 && edge2.lo < 1, `lo=${edge2.lo}`);
}

// ---------------------------------------------------------------------------
console.log('--- a tap is not speech (the exclusion that keeps this honest) ---');
// ---------------------------------------------------------------------------

{
  const taps = Array.from({ length: 30 }, (_, i) => ev({ tier: 'tap', at: T0 + i * 60000 }));
  const r = buildRecord(taps, { now: T0 + 86400000 });
  eq('taps are never scored', r.scoredAttempts, 0);
  eq('taps are counted and disclosed', r.excludedTaps, 30);
  eq('no speech was measured', r.speechWasMeasured, false);
  eq('no per-sound figures are produced from taps', r.targets.length, 0);

  const n = narrativeFor(r);
  ok('adherence is still reported for a tap-only session', /Practised on/.test(n[0]),
     'the child DID practise, and that is what a clinician most wants');
  ok('the narrative says plainly that no speech was measured',
     n.some((l) => /no speech was measured/i.test(l)));
  ok('tapping is not framed as a concern', n.some((l) => /not a concern/i.test(l)));
}
{
  // Mixed session: only the spoken attempts may count.
  const log = [
    ...Array.from({ length: 10 }, (_, i) => ev({ tier: 'tap', at: T0 + i * 60000 })),
    ...Array.from({ length: 10 }, (_, i) => ev({ tier: 'gop-webgpu', verdict: 'unsure', at: T0 + (20 + i) * 60000 })),
  ];
  const r = buildRecord(log, { now: T0 + 86400000 });
  eq('only spoken attempts are scored', r.scoredAttempts, 10);
  eq('the spoken attempts were all unsure', r.targets[0].producedCorrectly.point, 0);
  ok('taps did not inflate the rate', r.targets[0].producedCorrectly.point === 0,
     'this is the failure mode: taps would have made a silent child look 50% correct');
}

// ---------------------------------------------------------------------------
console.log('--- a forced resolution is a gift, not a measurement ---');
// ---------------------------------------------------------------------------

{
  const log = [
    ...Array.from({ length: 12 }, (_, i) => ev({ verdict: 'unsure', at: T0 + i * 60000 })),
    ...Array.from({ length: 12 }, (_, i) => ev({ forced: true, verdict: 'unsure', at: T0 + (20 + i) * 60000 })),
  ];
  const r = buildRecord(log, { now: T0 + 86400000 });
  eq('forced resolutions are excluded', r.scoredAttempts, 12);
  eq('and disclosed', r.excludedForcedResolutions, 12);
  eq('the rate reflects only real evidence', r.targets[0].producedCorrectly.point, 0);
  ok('the narrative discloses the exclusion',
     narrativeFor(r).some((l) => /encouragement cap/i.test(l)));
}

// ---------------------------------------------------------------------------
console.log('--- evidence gating: nothing claimed that data cannot support ---');
// ---------------------------------------------------------------------------

{
  const few = Array.from({ length: MIN_ATTEMPTS_PER_TARGET - 1 },
    (_, i) => ev({ verdict: 'clear', at: T0 + i * 60000 }));
  const r = buildRecord(few, { now: T0 + 86400000 });
  ok('a thin sound is flagged, not reported', r.targets[0].insufficientEvidence);
  eq('and carries no rate at all', r.targets[0].producedCorrectly, null);
  ok('the narrative says so rather than staying silent',
     narrativeFor(r).some((l) => new RegExp(`${MIN_ATTEMPTS_PER_TARGET} attempts`).test(l)));
}
{
  const some = Array.from({ length: MIN_ATTEMPTS_FOR_TREND - 1 },
    (_, i) => ev({ verdict: i % 2 ? 'clear' : 'unsure', at: T0 + i * 60000 }));
  const t = trendFor(some, 'r_initial');
  eq('no trend is claimed below the threshold', t.direction, 'insufficient-data');
}
{
  // A genuine, large improvement must be detected.
  const log = [
    ...Array.from({ length: 20 }, (_, i) => ev({ verdict: 'unsure', at: T0 + i * 60000 })),
    ...Array.from({ length: 20 }, (_, i) => ev({ verdict: 'clear', at: T0 + (30 + i) * 60000 })),
  ];
  eq('a large real improvement is detected', trendFor(log, 'r_initial').direction, 'improving');
  const decline = [...log].reverse();
  eq('a large real decline is detected', trendFor(decline, 'r_initial').direction, 'declining');
}
{
  // Pure noise must RARELY produce a direction.
  //
  // An earlier version of this test demanded ZERO false positives across 40
  // random learners, and that expectation was itself wrong. The one case it
  // caught was a coin that genuinely came up 5/20 then 15/20 -- a real and
  // extreme observed difference that no defensible rule should suppress.
  // Asserting a probabilistic rule never errs would be a false claim about
  // the method, which is exactly the kind of overstatement this whole layer
  // exists to avoid.
  //
  // So the assertion is a BOUND, matching what a 90% credible interval plus a
  // minimum effect size should deliver, and the residual rate is disclosed on
  // the report rather than pretended away.
  const N = 200;
  let falsePositives = 0;
  for (let seed = 0; seed < N; seed++) {
    let x = (seed * 2654435761) % 2147483647;
    const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    const log = Array.from({ length: 40 }, (_, i) =>
      ev({ verdict: rnd() < 0.5 ? 'clear' : 'unsure', at: T0 + i * 60000 }));
    if (trendFor(log, 'r_initial').direction !== 'no-clear-change') falsePositives++;
  }
  const rate = falsePositives / N;
  ok('noise rarely produces a trend claim', rate <= 0.05,
     `${falsePositives}/${N} = ${(rate * 100).toFixed(1)}% (bound 5%)`);
  console.log(`    false-positive rate on pure noise: ${(rate * 100).toFixed(1)}% of ${N} simulated learners`);
}

// ---------------------------------------------------------------------------
console.log('--- adherence: the number nobody else can produce ---');
// ---------------------------------------------------------------------------

{
  const log = [];
  for (const d of [0, 1, 2, 6, 7]) {          // a three-day lapse in the middle
    for (let i = 0; i < 5; i++) log.push(ev({ at: T0 + d * 86400000 + i * 60000 }));
  }
  const a = adherenceFrom(log, T0 + 9 * 86400000);
  eq('days practised', a.days, 5);
  eq('span', a.spanDays, 8);
  eq('sessions (30-minute gap rule)', a.sessions, 5);
  eq('longest lapse is found', a.longestGapDays, 3);
  eq('days since last practice', a.daysSinceLastPractice, 2);
  ok('a long lapse is surfaced in words',
     narrativeFor(buildRecord(log, { now: T0 + 9 * 86400000 })).some((l) => /Longest break: 3 days/.test(l)));
}
{
  const a = adherenceFrom([], Date.now());
  eq('no data degrades safely', a.days, 0);
  ok('and says why', /no timestamps/.test(a.note));
}

// ---------------------------------------------------------------------------
console.log('--- the control/inference separation (the correctness constraint) ---');
// ---------------------------------------------------------------------------

{
  const src = fs.readFileSync('./public/engine/clinical.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // The policy's beta state is decayed (0.92) and asymmetric (miss = 0.5) --
  // right for scheduling, wrong for inference. It must not appear here.
  ok('clinical never reads the policy beta state', !/\.\s*a\b\s*[/+*-]|\bpHat\b|\blearner\b|\bM\[/.test(code),
     'a clinician reading a number derived from the scheduler would be reading an artefact');
  ok('clinical does not import the policy', !/from\s+['"]\.\/policy\.js['"]/.test(src));
  ok('the report states its method version', /METHOD_VERSION/.test(src) && !!METHOD_VERSION);
}
{
  // End-to-end from a real engine, including its decayed learner state.
  const e = new LessonEngine({
    scorer: { score: async () => ({ verdict: 'unsure', tier: 'gop-webgpu' }) },
    clock: () => T0,
  });
  e.offerBeat(); e.chooseBeat(0);
  await e.submitAttempt(new Float32Array(16000));
  const r = buildRecord(e.log, { now: T0 + 86400000 });
  ok('a record builds straight off engine.log', r.totalAttempts === 1);
  ok('engine.log carries a timestamp', typeof e.log[0].at === 'number',
     'adherence is unrecoverable if not stamped at the moment of the attempt');
  ok('engine.log carries the level AT THE TIME', typeof e.log[0].level === 'number',
     'the target level mutates on promotion, so reading it later misattributes history');
  ok('no audio or voiceprint is retained anywhere in the record',
     !/audio|pcm|waveform|embedding|voiceprint/i.test(JSON.stringify(r)),
     'the amended COPPA Rule lists voiceprints as biometric personal information');
}

// ---------------------------------------------------------------------------
console.log('--- the artifact never diagnoses ---');
// ---------------------------------------------------------------------------

{
  const r = buildRecord([ev({})], { now: T0 });
  ok('a disclaimer is attached to the record itself', /practice, not therapy/i.test(r.disclaimer));
  ok('it states the scorer under-detects', /miss real errors/i.test(r.disclaimer));
  ok('it requires a clinician to interpret', /qualified clinician/i.test(r.disclaimer));

  const page = fs.readFileSync('./public/clinician/index.html', 'utf8');
  for (const banned of ['diagnos', 'disorder', 'assessment', 'severity score', 'normal range']) {
    ok(`the report page avoids "${banned}"`, !new RegExp(banned, 'i').test(page.replace(/does not diagnose[^<.]*/gi, '')),
       'this is a practice record, not a clinical assessment');
  }
  ok('the report states the interval mass', new RegExp(String(Math.round(CI_MASS * 100))).test(page));
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  x ' + f); process.exit(1); }
console.log('OK\n');
