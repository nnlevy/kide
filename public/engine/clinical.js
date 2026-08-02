// clinical.js -- the evidence layer. This is the B2B wedge.
//
// Spec section 7 names it precisely: "per-phoneme attempt counts, level
// progression, and adherence -- the data an SLP currently cannot get, which is
// the entire B2B wedge."
//
// WHY THIS IS THE DEFENSIBLE ASSET, and not the model or the art:
//
//   * The acoustic model is a commodity anyone can download. The selection
//     policy is replicable in a week. The artwork is commissionable. None of
//     those compound.
//   * A clinician sees a child for perhaps thirty minutes a fortnight. Home
//     practice generates per-phoneme longitudinal data every single day. That
//     asymmetry widens with every session and cannot be bought.
//   * ADHERENCE is the question nobody in home-programme speech therapy can
//     currently answer. The incumbent is a laminated printable with zero
//     visibility into whether it was ever used. "Did they practice, and on
//     what?" is worth paying for on its own.
//
// AND THE INVERSION THAT MAKES IT WORK:
//
//   The product's biggest technical weakness is that per-attempt scoring of
//   child speech is unreliable -- models miss real misarticulations about
//   three times more often than they false-flag correct speech (spec §1).
//   But the same evidence base shows AGGREGATE severity tracks clinicians at
//   ICC ~= 0.98. So many unreliable measurements aggregate into a reliable
//   trend. The thing that makes the product unsuitable for diagnosis is
//   exactly what makes it valuable as longitudinal evidence.
//
// ---------------------------------------------------------------------------
// THE CORRECTNESS CONSTRAINT THAT MATTERS MOST
// ---------------------------------------------------------------------------
//
// This file MUST NOT read the policy's beta state (`learner.M[k].a/.b`).
//
// That state is a CONTROL signal, deliberately biased for selection: it decays
// at 0.92 per attempt so it tracks recent ability, and it weights a miss at
// half a success because the scorer under-detects. Both choices are correct
// for deciding what to practice next, and both are WRONG for inference -- they
// systematically overstate ability and discard history.
//
// A clinician reading a number derived from it would be reading an artefact of
// our scheduling heuristic. So the clinical layer keeps its own accumulator
// over raw attempt events and computes honest statistics from those. A test
// asserts this file never touches `.a` or `.b`.
//
// Kide is practice, not therapy. Nothing here diagnoses or treats. It reports
// what happened, with uncertainty attached, so a qualified human can decide.

export const METHOD_VERSION = 'kide-clinical-1.0.0';

/** Below this many attempts we report nothing per-phoneme. An interval over
 *  three attempts is so wide it is not evidence, and printing it invites a
 *  reader to over-interpret noise. */
export const MIN_ATTEMPTS_PER_TARGET = 8;

/** Below this we won't claim a trend direction at all. */
export const MIN_ATTEMPTS_FOR_TREND = 20;

/** Minimum change worth reporting, in absolute proportion.
 *
 *  Non-overlapping credible intervals ALONE let noise through: measured over
 *  40 pure-coin-flip learners, that rule produced a direction claim once. A
 *  2.5% false-positive rate is unremarkable in research and unacceptable here,
 *  because the failure mode is a child discharged early on a change that never
 *  happened. Requiring a real effect as well as separated intervals removes
 *  it. The cost is missing very small genuine changes, which is the right
 *  trade: the remedy for that is another month of practice. */
export const MIN_REPORTABLE_EFFECT = 0.15;

/** Credible-interval mass. 0.90 rather than 0.95 -- with the sample sizes a
 *  home programme realistically produces, a 95% interval is so wide it reads
 *  as "we know nothing", which is itself misleading. Stated on every report. */
export const CI_MASS = 0.90;

// ---------------------------------------------------------------------------
// Statistics. Implemented here rather than pulled in, so the report has no
// runtime dependency a clinic's IT would have to vet.
// ---------------------------------------------------------------------------

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Continued-fraction expansion for the incomplete beta (Lentz's method). */
function betaCF(a, b, x) {
  const FPMIN = 1e-300, EPS = 3e-12;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b) -- the Beta CDF. */
export function betaCDF(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betaCF(a, b, x)) / a
    : 1 - (bt * betaCF(b, a, 1 - x)) / b;
}

/** Beta quantile by bisection. Slow in theory, irrelevant in practice: a
 *  report computes a few dozen of these once. */
export function betaQuantile(p, a, b) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (betaCDF(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Jeffreys interval for a binomial proportion.
 *
 *  Chosen over Wald deliberately: Wald's interval is badly wrong at small n
 *  and at proportions near 0 or 1, which is exactly where a struggling
 *  phoneme sits. Jeffreys uses the Beta(x+0.5, n-x+0.5) posterior, behaves at
 *  the boundaries, and is the standard recommendation for this case. */
export function jeffreysInterval(successes, n, mass = CI_MASS) {
  if (n <= 0) return { point: null, lo: null, hi: null, n: 0 };
  const a = successes + 0.5, b = n - successes + 0.5;
  const tail = (1 - mass) / 2;
  return {
    point: successes / n,
    lo: successes === 0 ? 0 : betaQuantile(tail, a, b),
    hi: successes === n ? 1 : betaQuantile(1 - tail, a, b),
    n,
  };
}

// ---------------------------------------------------------------------------
// The accumulator
// ---------------------------------------------------------------------------

/**
 * Build a clinical record from RAW attempt events.
 *
 * @param {Array} log  engine.log entries. The only input. Deliberately not the
 *                     learner state -- see the header.
 * @param {object} opts
 * @param {number} opts.now  ms timestamp, injectable for deterministic tests.
 */
/** A target key this file is willing to believe in.
 *
 *  The record can arrive from `?data=` -- a base64 blob in a URL a parent
 *  forwards and a clinician clicks. `target` is split into `phoneme` and
 *  `position` below and both are rendered into the report, so an unvalidated
 *  target is a script-injection vector on kide.us with nothing but a shared
 *  link required to deliver it. That mattered less when this page held only a
 *  local record; it matters now that the same origin stores a clinician's
 *  name, credentials, licence number and a child's chart reference.
 *
 *  Validated here rather than escaped at the point of render, because there is
 *  exactly one place records are built and several places they are displayed,
 *  and the rule "a phoneme target is letters and one underscore" is true of
 *  every legitimate value the engine has ever produced. */
const VALID_TARGET = /^[a-z]{1,4}_[a-z]{1,10}$/i;

export function buildRecord(log, { now = Date.now() } = {}) {
  const events = (log || []).filter((r) => r && r.target && VALID_TARGET.test(String(r.target)));

  // THE TWO EXCLUSIONS THAT DECIDE WHETHER THIS REPORT IS HONEST.
  //
  // 1. A TAP IS NOT SPEECH. The engine records a tap as verdict 'clear'
  //    because tapping is always a valid way to play and must never be
  //    punished -- but the child said nothing, so it is not evidence about
  //    their articulation. Counting taps would silently inflate every rate on
  //    this report, and would do so most for the children who talk least,
  //    which is precisely backwards. Only attempts actually scored from audio
  //    count.
  //
  // 2. A FORCED RESOLUTION IS A GIFT, NOT A DATA POINT. When the attempt cap
  //    fires the scene resolves regardless of what was heard. That is right
  //    for the child and meaningless as measurement.
  //
  // Both exclusions are reported on the artifact rather than hidden, so a
  // clinician can see what the denominator actually is.
  const isSpeech = (r) => r.tier && r.tier !== 'tap';
  const scored = events.filter((r) => isSpeech(r) && !r.forced && r.verdict !== 'no-input');

  const byTarget = new Map();
  for (const e of scored) {
    if (!byTarget.has(e.target)) {
      byTarget.set(e.target, { target: e.target, attempts: 0, clear: 0, levels: new Set(), words: new Set(), ts: [] });
    }
    const t = byTarget.get(e.target);
    t.attempts++;
    if (e.verdict === 'clear') t.clear++;
    t.words.add(e.word);
    if (e.level) t.levels.add(e.level);
    t.ts.push(e.at ?? null);
  }

  const targets = [...byTarget.values()].map((t) => {
    const ci = jeffreysInterval(t.clear, t.attempts);
    const enough = t.attempts >= MIN_ATTEMPTS_PER_TARGET;
    return {
      target: t.target,
      phoneme: t.target.split('_')[0],
      position: t.target.split('_')[1],
      attempts: t.attempts,
      clear: t.clear,
      // Reported only with enough evidence behind it. An interval over three
      // attempts spans almost the whole range and is not information.
      producedCorrectly: enough ? ci : null,
      distinctWords: t.words.size,
      insufficientEvidence: !enough,
      trend: enough ? trendFor(scored, t.target) : null,
    };
  }).sort((a, b) => b.attempts - a.attempts);

  return {
    methodVersion: METHOD_VERSION,
    generatedAt: new Date(now).toISOString(),
    ciMass: CI_MASS,
    totalAttempts: events.length,
    scoredAttempts: scored.length,
    excludedForcedResolutions: events.filter((r) => r.forced).length,
    excludedNoInput: events.filter((r) => r.verdict === 'no-input').length,
    // Surfaced, not hidden: on a tap-only device this is the whole session,
    // and a clinician must be able to see that no speech was measured at all.
    excludedTaps: events.filter((r) => !isSpeech(r)).length,
    speechWasMeasured: scored.length > 0,
    targets,
    adherence: adherenceFrom(events, now),
    // Stated on the artifact so a reader cannot mistake it for an assessment.
    disclaimer: 'Kide is practice, not therapy. This report describes what was '
      + 'practiced and what happened. It does not diagnose, assess, or treat, and '
      + 'automated scoring of young children\'s speech is known to miss real errors '
      + 'more often than it false-flags correct speech. Interpretation requires a '
      + 'qualified clinician.',
  };
}

/**
 * Direction of travel, with the uncertainty attached.
 *
 * Splits the target's attempts into an earlier and a later half and compares
 * the two proportions. A direction is only claimed when the two credible
 * intervals do not overlap -- a deliberately conservative rule. The cost of
 * saying "no clear change" when something improved is a clinician looking
 * again next month; the cost of claiming improvement that isn't there is a
 * child discharged early.
 */
export function trendFor(scored, targetKey) {
  const rows = scored.filter((r) => r.target === targetKey);
  if (rows.length < MIN_ATTEMPTS_FOR_TREND) {
    return { direction: 'insufficient-data', early: null, late: null, attempts: rows.length };
  }
  const mid = Math.floor(rows.length / 2);
  const early = rows.slice(0, mid);
  const late = rows.slice(mid);
  const e = jeffreysInterval(early.filter((r) => r.verdict === 'clear').length, early.length);
  const l = jeffreysInterval(late.filter((r) => r.verdict === 'clear').length, late.length);

  // Both conditions must hold: the intervals must separate AND the change must
  // be big enough to matter. See MIN_REPORTABLE_EFFECT.
  const effect = l.point - e.point;
  let direction = 'no-clear-change';
  if (l.lo > e.hi && effect >= MIN_REPORTABLE_EFFECT) direction = 'improving';
  else if (l.hi < e.lo && -effect >= MIN_REPORTABLE_EFFECT) direction = 'declining';

  return { direction, early: e, late: l, effect, attempts: rows.length };
}

/**
 * Adherence -- the number nobody else in this category can produce.
 *
 * An SLP sends a child home with a practice programme and, until now, has had
 * no way to know whether any of it happened. This is that number, and it is
 * arguably worth more to them than the accuracy figures.
 */
export function adherenceFrom(events, now) {
  const stamped = events.filter((e) => typeof e.at === 'number').sort((a, b) => a.at - b.at);
  if (!stamped.length) {
    return { days: 0, sessions: 0, attempts: events.length, note: 'no timestamps recorded' };
  }
  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const days = new Set(stamped.map((e) => dayKey(e.at)));

  // A gap of more than 30 minutes starts a new session.
  const SESSION_GAP_MS = 30 * 60 * 1000;
  let sessions = 1;
  for (let i = 1; i < stamped.length; i++) {
    if (stamped[i].at - stamped[i - 1].at > SESSION_GAP_MS) sessions++;
  }

  const firstMs = stamped[0].at, lastMs = stamped[stamped.length - 1].at;

  // CALENDAR days, not elapsed milliseconds. "Practiced on 5 of 8 days" and
  // "2 days since last practice" are statements about dates as a human reads a
  // calendar. Millisecond arithmetic gets both wrong whenever attempts sit at
  // different times of day -- it made an 8-day span read as 9, and a two-day
  // lapse read as one, which is precisely the number a clinician would act on.
  const dayIndex = (ms) => Math.floor(Date.parse(dayKey(ms) + 'T00:00:00Z') / 86400000);
  const spanDays = dayIndex(lastMs) - dayIndex(firstMs) + 1;

  // Longest run of consecutive days with no practice -- the number that tells
  // a clinician whether a programme lapsed.
  const sortedDays = [...days].sort();
  let longestGap = 0;
  for (let i = 1; i < sortedDays.length; i++) {
    const gap = Math.round((Date.parse(sortedDays[i] + 'T00:00:00Z')
                          - Date.parse(sortedDays[i - 1] + 'T00:00:00Z')) / 86400000) - 1;
    if (gap > longestGap) longestGap = gap;
  }
  const sinceLast = Math.max(0, dayIndex(now) - dayIndex(lastMs));

  return {
    days: days.size,
    spanDays,
    daysPracticedRate: days.size / spanDays,
    sessions,
    attempts: events.length,
    attemptsPerSession: events.length / sessions,
    longestGapDays: longestGap,
    daysSinceLastPractice: sinceLast,
    firstPractice: new Date(firstMs).toISOString(),
    lastPractice: new Date(lastMs).toISOString(),
  };
}

/**
 * What a clinician would want said in words, derived strictly from the record.
 * Every sentence is gated on evidence; nothing is asserted that the intervals
 * do not support.
 */
export function narrativeFor(record) {
  const lines = [];
  const a = record.adherence;

  if (!a.days) {
    lines.push('No practice has been recorded yet.');
    return lines;
  }
  lines.push(
    `Practiced on ${a.days} of ${a.spanDays} days (${Math.round(a.daysPracticedRate * 100)}%), `
    + `${a.sessions} session${a.sessions === 1 ? '' : 's'}, `
    + `${record.scoredAttempts} scored attempt${record.scoredAttempts === 1 ? '' : 's'}.`
  );
  if (a.longestGapDays >= 3) {
    lines.push(`Longest break: ${a.longestGapDays} days.`);
  }
  if (a.daysSinceLastPractice >= 7) {
    lines.push(`No practice in the last ${a.daysSinceLastPractice} days.`);
  }

  // Adherence above is reported whether or not any speech was scored -- the
  // child DID practice, and on a tap-only device that is the whole of what a
  // clinician can be told. Reporting the engagement and then declining to
  // report articulation is the honest split.
  if (!record.speechWasMeasured) {
    lines.push(
      `All ${record.excludedTaps} attempt${record.excludedTaps === 1 ? '' : 's'} were completed by tapping `
      + 'rather than speaking, so no speech was measured. Tapping is a valid way to play '
      + 'and is not a concern in itself, but no articulation figures can be reported from it.'
    );
    return lines;
  }

  const reportable = record.targets.filter((t) => !t.insufficientEvidence);
  if (!reportable.length) {
    lines.push(
      `No individual sound yet has the ${MIN_ATTEMPTS_PER_TARGET} attempts needed to report a rate with useful precision.`
    );
    return lines;
  }

  const improving = reportable.filter((t) => t.trend && t.trend.direction === 'improving');
  const declining = reportable.filter((t) => t.trend && t.trend.direction === 'declining');
  if (improving.length) {
    lines.push(`Measurable improvement in ${improving.map((t) => `/${t.phoneme}/ ${t.position}`).join(', ')}.`);
  }
  if (declining.length) {
    lines.push(`Lower recent rate in ${declining.map((t) => `/${t.phoneme}/ ${t.position}`).join(', ')} — worth a look.`);
  }
  if (!improving.length && !declining.length) {
    lines.push('No sound shows a change large enough to distinguish from normal variation yet.');
  }

  const excluded = record.excludedForcedResolutions;
  if (excluded) {
    lines.push(
      `${excluded} attempt${excluded === 1 ? '' : 's'} resolved on the encouragement cap and `
      + `${excluded === 1 ? 'was' : 'were'} excluded from all figures above.`
    );
  }
  return lines;
}
