// naming.js -- the child names their companion.
//
// Spec section 2: "The child names their companion. That name is then the
// FIRST PRACTICE TARGET, because a name you chose is the most motivating word
// in the language."
//
// So this is not a cosmetic settings screen. It is the first lesson, hiding in
// plain sight, and it also passes the brief's own first user test: a name a
// two-year-old can actually say.
//
// Two things the bible is firm about, both honoured here:
//
//   * SPEAK THE NAME, DON'T SYNTHESISE IT. On-device TTS is good now, but
//     neural front-ends reliably mangle uncommon proper names, and there is no
//     evidence synthesised speech survives being spliced mid-sentence beside
//     professional human VO. So names come from a recorded bank, and anything
//     outside it falls back to a parent recording rather than to a robot
//     mispronouncing a child's chosen word back at them.
//
//   * The offered names are chosen for SAYABILITY, not cuteness. Each one is
//     short, front-loaded with an early-acquired consonant, and phonemically
//     simple enough that a two-year-old succeeds on it immediately -- the
//     first target should be a win.

import { LEX } from '../engine/lexicon.js';

/** The recorded name bank.
 *
 *  `ph` is the gruut phoneme sequence, and `target` is the phoneme/position
 *  this name practises -- which is what makes the name a real lesson rather
 *  than a label. All are early-acquired sounds so the first attempt succeeds.
 */
export const NAME_BANK = [
  { name: 'Butterbean', ph: ['b','ʌ','t','ɚ','b','i','n'], target: 'b_initial', for: 'goldendoodle' },
  { name: 'Marmalade',  ph: ['m','ɑ','ɹ','m','ə','l','eɪ','d'], target: 'm_initial', for: 'cat' },
  { name: 'Rosie',      ph: ['ɹ','oʊ','z','i'], target: 'r_initial', for: 'friend' },
  { name: 'Pip',        ph: ['p','ɪ','p'], target: 'p_initial', for: 'toy' },
  { name: 'Momo',       ph: ['m','oʊ','m','oʊ'], target: 'm_initial' },
  { name: 'Bo',         ph: ['b','oʊ'], target: 'b_initial' },
  { name: 'Poppy',      ph: ['p','ɑ','p','i'], target: 'p_medial' },
  { name: 'Dot',        ph: ['d','ɑ','t'], target: 'd_initial' },
  { name: 'Nell',       ph: ['n','ɛ','l'], target: 'n_initial' },
  { name: 'Willow',     ph: ['w','ɪ','l','oʊ'], target: 'w_initial' },
  { name: 'Kiki',       ph: ['k','i','k','i'], target: 'k_initial' },
  { name: 'Bramble',    ph: ['b','ɹ','æ','m','b','ə','l'], target: 'b_initial' },
];

/** Names suggested for a given actor: its own default first, then the rest of
 *  the bank. Every option is recorded, so every option can be spoken aloud in
 *  the real voice. */
export function namesFor(actorId, count = 4) {
  const own = NAME_BANK.filter((n) => n.for === actorId);
  const rest = NAME_BANK.filter((n) => n.for !== actorId);
  return [...own, ...rest].slice(0, count);
}

/** Turn the chosen name into a real practice target.
 *
 *  Returns the lexicon-shaped entry the scorer expects, so the name can be
 *  scored by exactly the same path as any other word -- no special case in the
 *  engine, no second code path to keep correct.
 */
export function nameAsTarget(entry, vocab) {
  const ids = entry.ph.map((p) => vocab[p]).filter((v) => v !== undefined);
  const [ph, pos] = entry.target.split('_');
  return {
    w: entry.name,
    ph, pos,
    lvl: 2,
    aff: ['HIDDEN'],       // "someone's here! is it <name>?" -- reads naturally
    ipa: entry.ph,
    ids,
    isName: true,
  };
}

/** Is this name fully scoreable with the acoustic model we ship? A name we
 *  cannot score is a name we must not use as the first target -- the first
 *  attempt has to be a win. */
export function nameIsScoreable(entry, vocab) {
  return entry.ph.every((p) => vocab[p] !== undefined);
}

/** A parent recording is the fallback for any name outside the bank.
 *  The bible's own conclusion, and it is the right one: "A parent recording
 *  their own child's name is better than perfect synthesis anyway." */
export const CUSTOM_NAME_POLICY = {
  allowed: true,
  requiresParentRecording: true,
  neverSynthesise: true,
  why: 'Neural TTS mangles uncommon proper names, and a robot mispronouncing a '
     + "child's chosen name back at them is worse than not saying it at all.",
};

/** Does the lexicon already carry this target, so the name slots into the
 *  existing ladder rather than creating an orphan? */
export function targetExistsInLexicon(targetKey) {
  return LEX.some((x) => `${x.ph}_${x.pos}` === targetKey);
}
