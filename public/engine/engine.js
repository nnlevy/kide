// engine.js -- the orchestrator. Turns the policy and the scorer into a
// sequence of beats a scene layer can render. Still no DOM, no audio: this
// file decides WHAT happens, never how it looks or sounds.
//
// The attempt flow here is the product's whole safety argument, so it is worth
// stating plainly rather than leaving it implicit in the code:
//
//   Automated scoring of 3-7 year-old speech is unreliable. The best available
//   evidence (spec section 1) has models missing real misarticulations about
//   three times more often than they false-flag correct speech, even after
//   fine-tuning on domain data. We cannot fix that, so the design refuses to
//   depend on it:
//
//     * There is no failure state. Ever. A low score produces a warm re-invite
//       in which the companion models the sound, never a "wrong".
//     * MAX_ATTEMPTS resolves the scene REGARDLESS of score. A child who tried
//       three times has earned the magic, and a stuck child is a churned child.
//     * Per-attempt scores are surfaced to nobody -- not the child, not the
//       parent. Only aggregate movement over many attempts reaches the weekly
//       report, and even then as a trend with confidence, never a verdict.
//
//   The result is a product that is robust exactly where the technology is
//   weak. That alignment is the strongest argument for the design, and it is
//   the reason a 5x scorer improvement would change the numbers in a report
//   but not change a single thing a child experiences.

import { LEX, STATIONS, keyOf } from './lexicon.js';
import {
  createLearner, selectNext, offerChoices, record, carList, pHat, refreshPool,
  activeTargets, ZPD_LO, ZPD_HI,
} from './policy.js';

export const MAX_ATTEMPTS = 3;

export const STATE = {
  STUCK: 'STUCK',
  ASK: 'ASK',
  MODEL: 'MODEL',
  TRIUMPH: 'TRIUMPH',
  WAIT: 'WAIT',
};

export class LessonEngine {
  /**
   * @param {object}  opts
   * @param {string}  opts.companionName  what the child named their companion
   * @param {string}  opts.concern        parent-stated starting concern
   * @param {object}  opts.scorer         a Scorer from scoring.js (optional --
   *                                      without one the engine runs tap-only,
   *                                      which is a complete experience)
   * @param {Function} opts.rng           injectable for deterministic tests
   */
  /**
   * @param {Function} opts.journal  optional sink for durable evidence. Kept as
   *   an injected function rather than an import so the engine stays pure and
   *   testable -- and so a caller that does not want persistence simply does
   *   not pass one.
   */
  constructor({ companionName = 'Butterbean', concern = 'unclear', scorer = null,
                rng = Math.random, clock = () => Date.now(), journal = null } = {}) {
    this.journal = journal;
    this.companionName = companionName;
    this.scorer = scorer;
    // Injectable so clinical output is deterministic under test.
    this.clock = clock;
    this.learner = createLearner({ concern, rng });
    this.current = null;
    this.attempt = 0;
    this.pendingOffer = null;
    this.log = [];
  }

  /** Advance to the next beat: pick a target, a word, and the scene that word
   *  can act inside. The lesson chooses the word; the word chooses the scene. */
  nextBeat() {
    // Retire mastered targets and admit new ones before choosing, so a child
    // who has finished a sound meets the next one immediately rather than at
    // some later arbitrary boundary.
    const poolChange = refreshPool(this.learner);
    const pick = selectNext(this.learner);
    this.current = {
      target: pick.target.m,
      word: pick.word,
      affordance: pick.affordance,
      station: STATIONS[pick.affordance],
      beat: this.learner.beat,
    };
    this.attempt = 0;
    this.learner.lastKey = keyOf(pick.target.m);
    this.learner.lastStation = pick.affordance;
    return {
      ...this.current,
      state: STATE.ASK,
      invitation: STATIONS[pick.affordance].ask(this.companionName, pick.word.w),
      poolChange,
    };
  }

  /** Offer the child several places they could go next, all practising the
   *  same sound. The child picks; nothing happens until they do.
   *
   *  Prefer this over nextBeat() for child-facing surfaces. nextBeat() decides
   *  FOR the child and pans the world there, which makes the companion the
   *  protagonist; this makes the child the protagonist while keeping the
   *  pedagogy identical and still invisible. See offerChoices() in policy.js.
   */
  offerBeat({ count = 3 } = {}) {
    const poolChange = refreshPool(this.learner);
    const offer = offerChoices(this.learner, { count });
    this.pendingOffer = offer;
    return {
      state: STATE.WAIT, // the world waits, indefinitely and warmly
      target: offer.target.m,
      poolChange,
      choices: offer.choices.map((c) => ({
        word: c.word,
        affordance: c.affordance,
        station: STATIONS[c.affordance],
        // What the child sees offered. Deliberately an invitation to go and
        // do something, not a question with a right answer.
        label: c.word.w,
        invitation: STATIONS[c.affordance].ask(this.companionName, c.word.w),
      })),
    };
  }

  /** The child chose one of the offered routes. THIS is what starts the beat.
   *  @param {number} index into the offered choices */
  chooseBeat(index) {
    if (!this.pendingOffer) throw new Error('no offer outstanding -- call offerBeat() first');
    const choice = this.pendingOffer.choices[index];
    if (!choice) throw new Error(`no choice at index ${index}`);
    const target = this.pendingOffer.target.m;

    this.current = {
      target,
      word: choice.word,
      affordance: choice.affordance,
      station: STATIONS[choice.affordance],
      beat: this.learner.beat,
      chosenByChild: true,
    };
    this.attempt = 0;
    this.learner.lastKey = keyOf(target);
    this.learner.lastStation = choice.affordance;
    this.pendingOffer = null;

    return {
      ...this.current,
      state: STATE.ASK,
      invitation: STATIONS[choice.affordance].ask(this.companionName, choice.word.w),
    };
  }

  /** Submit one attempt.
   *
   *  `pcm` may be null -- that is a tap, which is always a valid way to play
   *  and is treated as a success. A child who taps has still engaged with the
   *  word; we are not going to punish a two-year-old for a quiet room, a
   *  broken microphone, or a device that can't listen privately.
   */
  async submitAttempt(pcm = null) {
    if (!this.current) throw new Error('no active beat -- call nextBeat() first');
    this.attempt++;

    let result;
    if (pcm === null || !this.scorer) {
      result = { verdict: 'clear', tier: 'tap', score: null, confidence: 1, detail: 'tap' };
    } else {
      result = await this.scorer.score(pcm, this.current.word);
    }

    const forced = this.attempt >= MAX_ATTEMPTS;
    const heardClearly = result.verdict === 'clear';
    // Generosity on uncertainty: 'unsure' and 'no-input' both re-invite rather
    // than fail -- until the attempt cap, which resolves regardless of score.
    const resolves = heardClearly || forced;

    // Mastery only moves on evidence. A forced resolution after three tries is
    // a gift to the child, not a data point about their /r/ -- recording it as
    // a success would corrupt the very trend the parent report is built on.
    let promoted = false;
    if (heardClearly) {
      promoted = record(this.learner, this.current.target, true);
    } else if (result.verdict === 'unsure' && !forced) {
      promoted = record(this.learner, this.current.target, false);
    }

    const beatRecord = {
      beat: this.learner.beat,
      target: keyOf(this.current.target),
      word: this.current.word.w,
      affordance: this.current.affordance,
      attempt: this.attempt,
      verdict: result.verdict,
      tier: result.tier,
      resolves,
      forced: forced && !heardClearly,
      promoted,
      pHat: pHat(this.current.target),
      // --- fields the clinical layer needs (public/engine/clinical.js) ------
      // `at` makes adherence computable at all -- days practised, session
      // count, longest lapse. That is the number no one else in this category
      // can produce, and it is unrecoverable if not stamped at the moment of
      // the attempt.
      at: this.clock(),
      // Level at the time of the attempt. Recorded here because the target's
      // level MUTATES on promotion, so reading it later would misattribute
      // every earlier attempt to the level the child eventually reached.
      level: this.current.target.lvl,
      // Timestamped, per-phoneme, and never audio. The amended COPPA Rule
      // lists voiceprints as biometric personal information; nothing in this
      // record could re-identify a child by voice.
    };
    this.log.push(beatRecord);
    // Persist immediately. Evidence that only exists in memory is not evidence:
    // adherence is entirely a function of history, and a month of it must
    // survive a browser restart.
    if (this.journal) {
      try { this.journal({ ...beatRecord, surface: 'scene' }); } catch { /* never break play */ }
    }

    if (resolves) {
      this.learner.beat++;
      return {
        ...beatRecord,
        state: STATE.TRIUMPH,
        // The companion celebrates WITH the child, never AT them -- and a
        // forced resolution is celebrated identically. The child must not be
        // able to tell the difference; that is the entire point.
        say: `${this.companionName} did it! You said ${this.current.word.w}!`,
      };
    }

    return {
      ...beatRecord,
      state: STATE.MODEL,
      // MODEL is always clumsy and endearing, never corrective.
      say: `${this.companionName} tries... ${this.current.word.w}... let's say it together!`,
      attemptsLeft: MAX_ATTEMPTS - this.attempt,
    };
  }

  /** Everything the weekly parent report needs. No separate analytics pipeline
   *  -- the engine already holds it (spec section 7).
   *
   *  Note what is NOT here: any per-attempt score, and any claim of assessment.
   *  Aggregate severity tracks clinicians well (ICC ~0.98) even where
   *  per-phoneme judgements do not, so this reports movement, with confidence,
   *  and never a verdict. */
  parentReport() {
    const targets = Object.values(this.learner.M)
      .filter((m) => m.n > 0 || m.graduated)
      .map((m) => ({
        target: keyOf(m),
        phoneme: m.ph,
        position: m.pos,
        attempts: m.n,
        level: m.lvl,
        pHat: pHat(m),
        band: pHat(m) > ZPD_HI ? 'strong' : pHat(m) < ZPD_LO ? 'emerging' : 'developing',
      }))
      .sort((a, b) => b.attempts - a.attempts);

    const attempts = this.log.length;
    const heard = this.log.filter((r) => r.verdict === 'clear').length;
    return {
      sessionBeats: this.learner.beat,
      attempts,
      // Confidence is deliberately coarse. With few attempts we say so rather
      // than implying precision we do not have.
      confidence: attempts >= 40 ? 'good' : attempts >= 15 ? 'early' : 'too-soon',
      clearRate: attempts ? heard / attempts : null,
      targets,
      carList: carList(this.learner),
      distinctWords: new Set(this.log.map((r) => r.word)).size,
      promotions: this.log.filter((r) => r.promoted).length,
      forcedResolutions: this.log.filter((r) => r.forced).length,
      activeTargets: activeTargets(this.learner).map((m) => keyOf(m)),
      graduated: Object.values(this.learner.M).filter((m) => m.graduated).map((m) => keyOf(m)),
    };
  }
}

export { LEX, STATIONS, keyOf, pHat };
