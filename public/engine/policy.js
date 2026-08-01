// policy.js -- mastery model and selection policy. Pure functions, no DOM,
// no audio, no network. Spec section 5.
//
// The child never sees any of this. It decides what to practise next; the
// scene it lands in is chosen by the word, and the word is chosen by the
// target. That ordering is what makes the pedagogy invisible -- the child
// sees a companion who needs a rope, not a drill on /r/.
//
// Every constant here is load-bearing and was verified against the audited
// prototype (kide-us-lesson-framework.html). Two of them exist specifically
// because a simulation caught the engine failing:
//   * DECAY -- without it, beta counts accumulate forever, old failures never
//     wash out, and no promotion is ever reachable (zero promotions in 40
//     beats despite real underlying improvement).
//   * the ASYMMETRIC zpdFit falloff -- with a symmetric one, the two weakest
//     sounds were never selected once in 40 beats. A child who struggles with
//     /r/ would open the app every day and never practise /r/.
// Re-run simulate.js against any change to this file. These failure modes are
// invisible in a five-beat manual playthrough and obvious in forty simulated.

import { LEX, keyOf } from './lexicon.js';

export const ZPD_LO = 0.55;
export const ZPD_HI = 0.85;
export const PROMOTE_AT = 0.85;
export const PROMOTE_N = 4;
export const DECAY = 0.92;
export const MAX_LEVEL = 5;

export const W_ZPD = 0.58;
export const W_DUE = 0.34;
export const VARIETY_PENALTY = -0.55;
export const JITTER = 0.05;

export const ZPD_FLOOR = 0.18;
export const FALLOFF_ABOVE = 2.4; // mastered -- space it out hard
export const FALLOFF_BELOW = 1.2; // the reason the family is here -- keep it in rotation
export const DUENESS_CAP = 2.2;

export const SUCCESS_WEIGHT = 1.0;
export const MISS_WEIGHT = 0.5; // misses weigh half -- the scorer is unreliable

/** How many targets are live at once.
 *
 *  This is not a tuning knob, it is a correctness requirement, and it was
 *  found by simulation rather than reasoning.
 *
 *  The selection policy was verified against the prototype's 6 targets. The
 *  production lexicon carries 19. At 19, the policy STARVES the weakest sounds
 *  outright: an in-band target scores zpdFit 1.0 while a struggling one scores
 *  0.64, and since dueness saturates at its cap for everything unselected, the
 *  in-band target wins every time. Over 40 beats a child's worst phoneme was
 *  selected zero times across all 25 seeds tested -- the exact failure the
 *  asymmetric falloff was introduced to prevent, reappearing purely because
 *  the lexicon got bigger.
 *
 *  So the pool is capped at the size the policy is known to behave at. This
 *  also happens to be what clinical practice does: nobody works nineteen
 *  phonemes simultaneously with a three-year-old. Targets graduate out when
 *  genuinely mastered and new ones take their place, which is what gives the
 *  full 85-word lexicon somewhere to go. */
export const POOL_SIZE = 6;

/** Starting beliefs by parent-stated concern. Not a difficulty setting (spec
 *  section 8 forbids one) -- it only seeds where practice begins, and the
 *  engine moves off it within a handful of beats. */
export const SEEDS = {
  unclear: { b:[3,1], r:[1,3], l:[2,2], m:[4,1], s:[1,2], p:[2,2] },
  late:    { b:[2,1], r:[1,2], l:[1,2], m:[3,1], s:[1,2], p:[1,2] },
  reading: { b:[4,1], r:[3,2], l:[3,1], m:[4,1], s:[2,2], p:[3,1] },
};

export const pHat = (m) => m.a / (m.a + m.b);

/** Fresh learner state. `rng` is injectable so simulations and tests are
 *  deterministic; production passes nothing and gets Math.random. */
export function createLearner({ concern = 'unclear', rng = Math.random, poolSize = POOL_SIZE } = {}) {
  const seed = SEEDS[concern] || SEEDS.unclear;
  const M = {};
  for (const x of LEX) {
    const k = keyOf(x);
    if (!M[k]) {
      const [a, b] = seed[x.ph] || [1, 1];
      M[k] = { ph: x.ph, pos: x.pos, a, b, lvl: x.lvl, lastBeat: -99, n: 0, active: false, graduated: false };
    } else {
      // a target starts at the lowest rung any of its words occupies
      M[k].lvl = Math.min(M[k].lvl, x.lvl);
    }
  }
  const learner = { M, beat: 0, lastKey: null, lastStation: null, rng, concern, poolSize, history: [] };

  // The concern's named phonemes ARE the intended working set -- they were
  // chosen to span weak to strong so the ZPD band has something on both sides
  // of it. Seed the pool with those first, then top up if short.
  const named = Object.keys(seed);
  const byNeed = Object.keys(M).sort((ka, kb) => {
    const an = named.includes(M[ka].ph) ? 0 : 1;
    const bn = named.includes(M[kb].ph) ? 0 : 1;
    if (an !== bn) return an - bn;
    return pHat(M[ka]) - pHat(M[kb]); // weakest first -- they are why the family is here
  });
  for (const k of byNeed.slice(0, poolSize)) M[k].active = true;
  return learner;
}

/** Targets currently in rotation. */
export const activeTargets = (learner) => Object.values(learner.M).filter((m) => m.active);

/** How many words a target can still reach at its current level -- a target
 *  with nowhere to go is a dead slot. */
function reachableWords(m) {
  const k = m.ph + '_' + m.pos;
  return LEX.filter((x) => keyOf(x) === k && x.lvl <= m.lvl).length;
}

/** Retire genuinely-mastered targets and promote new ones in behind them.
 *  A target only graduates once it has climbed the whole ladder AND holds
 *  above the promotion threshold -- mastery of the phrase level, not just of
 *  saying the word once. */
export function refreshPool(learner) {
  const changes = { graduated: [], admitted: [] };
  for (const m of activeTargets(learner)) {
    if (m.lvl >= MAX_LEVEL && pHat(m) > PROMOTE_AT && m.n >= PROMOTE_N) {
      m.active = false;
      m.graduated = true;
      changes.graduated.push(keyOf(m));
    }
  }
  const openSlots = learner.poolSize - activeTargets(learner).length;
  if (openSlots > 0) {
    const candidates = Object.values(learner.M)
      .filter((m) => !m.active && !m.graduated)
      // most reachable words first: a new target should have room to run and
      // enough scene variety to not feel like a drill
      .sort((a, b) => reachableWords(b) - reachableWords(a) || pHat(a) - pHat(b));
    for (const m of candidates.slice(0, openSlots)) {
      m.active = true;
      changes.admitted.push(keyOf(m));
    }
  }
  return changes;
}

/** How well does this target sit in the learning band?
 *  Asymmetric on purpose -- see the file header. */
export function zpdFit(p) {
  if (p >= ZPD_LO && p <= ZPD_HI) return 1;
  const below = p < ZPD_LO;
  const d = below ? ZPD_LO - p : p - ZPD_HI;
  return Math.max(ZPD_FLOOR, 1 - d * (below ? FALLOFF_BELOW : FALLOFF_ABOVE));
}

/** Spaced retrieval. Stronger targets wait longer before returning. Capped at
 *  DUENESS_CAP but deliberately uncapped past 1.0, so a long-neglected target
 *  eventually outranks a comfortable one no matter how strong it is. */
export function dueness(m, beat) {
  const gap = beat - m.lastBeat;
  const want = 1 + Math.round(pHat(m) * 5);
  return Math.min(DUENESS_CAP, gap / want);
}

export function scoreTarget(m, { beat, lastKey }) {
  const p = pHat(m);
  const fit = zpdFit(p);
  const due = dueness(m, beat);
  const variety = keyOf(m) === lastKey ? VARIETY_PENALTY : 0;
  return { m, p, fit, due, variety, base: fit * W_ZPD + due * W_DUE + variety };
}

/** Pick the next (target, word, station).
 *
 *  Interleave, never block: a station we just used is skipped, and repeating
 *  a target costs VARIETY_PENALTY. Blocked practice looks better within a
 *  session and is worse for retention, and retention is what the product is
 *  judged on.
 *
 *  Words are filtered by `x.lvl <= m.lvl`, which is where the complexity
 *  ladder actually bites -- and it only works because every level of a target
 *  shares one key (see keyOf in lexicon.js). */
export function selectNext(learner, { avoidStationRepeat = true } = {}) {
  const { beat, lastKey, lastStation, rng } = learner;
  const pool = activeTargets(learner);
  const scored = (pool.length ? pool : Object.values(learner.M))
    .map((m) => {
      const s = scoreTarget(m, { beat, lastKey });
      return { ...s, score: s.base + rng() * JITTER };
    })
    .sort((x, y) => y.score - x.score);

  for (const c of scored) {
    const k = keyOf(c.m);
    const words = LEX.filter((x) => keyOf(x) === k && x.lvl <= c.m.lvl);
    const opts = [];
    for (const x of words) {
      for (const a of x.aff) {
        if (!avoidStationRepeat || a !== lastStation) opts.push({ word: x, aff: a });
      }
    }
    if (opts.length) {
      const pick = opts[Math.floor(rng() * opts.length)];
      return { target: c, word: pick.word, affordance: pick.aff, scored };
    }
  }

  // Degenerate fallback: every candidate's only words sit at the station we
  // just used. Relax the station constraint rather than return nothing --
  // a repeated scene is much better than a stalled session.
  if (avoidStationRepeat) return selectNext(learner, { avoidStationRepeat: false });

  const f = scored[0];
  const w = LEX.find((x) => keyOf(x) === keyOf(f.m)) || LEX[0];
  return { target: f, word: w, affordance: w.aff[0], scored };
}

/** Record an attempt outcome against a target.
 *
 *  Decay runs BEFORE the update so p-hat tracks recent ability, which is what
 *  mastery means. Misses weigh half a success because the underlying scorer
 *  misses real errors far more often than it false-flags correct speech --
 *  the update asymmetry mirrors the error profile of the classifier feeding
 *  it (spec section 1). */
export function record(learner, m, success) {
  m.n++;
  m.lastBeat = learner.beat;
  m.a *= DECAY;
  m.b *= DECAY;
  if (success) m.a += SUCCESS_WEIGHT;
  else m.b += MISS_WEIGHT;

  let promoted = false;
  if (pHat(m) > PROMOTE_AT && m.n >= PROMOTE_N && m.lvl < MAX_LEVEL) {
    m.lvl++;
    m.n = 0;
    promoted = true;
  }
  return promoted;
}

/** Offer the child several DIFFERENT things they could go and do, all of which
 *  serve the same phoneme target.
 *
 *  This is the child-driven variant of selectNext, and the difference is not
 *  cosmetic. `selectNext` picks one word at one station and the world pans
 *  there: the engine decides, the companion needs something, and the child
 *  supplies it. That makes the COMPANION the protagonist and the child the
 *  assistant.
 *
 *  Here the engine still chooses the target -- the pedagogy stays invisible
 *  and stays correct -- but the child chooses which of several equally valid
 *  routes to take. Every option practises the same sound, so their choice
 *  genuinely drives the world without ever derailing the lesson. The agency
 *  is real rather than an illusion, and it is the same mechanism that already
 *  makes Pip's Turn work: the child is the one doing, not the one being
 *  tested (docs/HABITS.md).
 *
 *  Falls back gracefully: if a target can only reach one word, one choice is
 *  offered rather than none. A single option is still the child's to take.
 */
export function offerChoices(learner, { count = 3, avoidStationRepeat = true } = {}) {
  const { beat, lastKey, lastStation, rng } = learner;
  const pool = activeTargets(learner);
  const scored = (pool.length ? pool : Object.values(learner.M))
    .map((m) => {
      const s = scoreTarget(m, { beat, lastKey });
      return { ...s, score: s.base + rng() * JITTER };
    })
    .sort((x, y) => y.score - x.score);

  for (const c of scored) {
    const k = keyOf(c.m);
    const words = LEX.filter((x) => keyOf(x) === k && x.lvl <= c.m.lvl);
    let opts = [];
    for (const x of words) {
      for (const a of x.aff) {
        if (!avoidStationRepeat || a !== lastStation) opts.push({ word: x, affordance: a });
      }
    }
    if (!opts.length) continue;

    // Prefer visibly different choices -- distinct words at distinct places.
    // Two routes to the same object is not a choice a child can feel.
    const seenWord = new Set(), seenAff = new Set(), spread = [], rest = [];
    for (let i = opts.length - 1; i > 0; i--) { // shuffle first, so it varies
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    for (const o of opts) {
      if (!seenWord.has(o.word.w) && !seenAff.has(o.affordance)) {
        spread.push(o); seenWord.add(o.word.w); seenAff.add(o.affordance);
      } else rest.push(o);
    }
    const chosen = [...spread, ...rest].slice(0, count);
    if (chosen.length) return { target: c, choices: chosen, scored };
  }

  if (avoidStationRepeat) return offerChoices(learner, { count, avoidStationRepeat: false });
  const f = scored[0];
  const w = LEX.find((x) => keyOf(x) === keyOf(f.m)) || LEX[0];
  return { target: f, choices: [{ word: w, affordance: w.aff[0] }], scored };
}

/** The three highest-dueness targets sitting just below the band -- literally
 *  the words most likely to come up next. This is what makes the parent
 *  report's "try these in the car" list a true statement about tomorrow's
 *  session rather than a generic tip (spec section 7). */
export function carList(learner, n = 3) {
  return activeTargets(learner)
    .filter((m) => pHat(m) < ZPD_LO)
    .sort((x, y) => dueness(y, learner.beat) - dueness(x, learner.beat))
    .slice(0, n)
    .map((m) => {
      const words = LEX.filter((x) => keyOf(x) === keyOf(m) && x.lvl <= m.lvl);
      return {
        target: keyOf(m),
        pHat: pHat(m),
        words: words.slice(0, 3).map((x) => x.w),
      };
    });
}
