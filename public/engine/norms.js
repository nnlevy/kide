// norms.js -- when a speech sound is actually expected to arrive.
//
// WHY THIS EXISTS. The most common thing a parent types into a search box at
// 11pm is a version of "is it normal that my four-year-old can't say R". The
// honest answer is usually yes, and almost nobody in this market says so,
// because the business model on the other side of that question is therapy.
//
// Kide's answer is the true one. A parent who is told "that's on time, and
// here's what to play anyway" has been given something real, and is far more
// likely to trust the thing that told them than the site that implied a
// problem. Reassurance is the acquisition strategy, not a footnote to it.
//
// SOURCE. McLeod, S., & Crowe, K. (2018). Children's consonant acquisition in
// 27 languages: A cross-linguistic review. American Journal of Speech-Language
// Pathology, 27(4), 1546-1571. doi:10.1044/2018_AJSLP-17-0100
//
// The figure used is the 90% mastery age at the ALL-POSITIONS criterion: the
// age by which 90% of typically developing children produce the sound
// correctly in initial, medial AND final position. The 90% criterion is the
// current evidence-based standard; older charts using 50% (Templin 1957) or
// 75% (Sander 1972) give earlier ages and over-flag ordinary late acquisition
// as delay. Using the conservative figure is the whole point -- an early
// number would manufacture exactly the worry this page exists to defuse.
//
// WHAT THIS IS NOT. A screening tool, and nothing here is a diagnosis. The 10%
// of children who acquire a sound later than the listed age are still typical.
// Every page built from this says so, in those words.

export const CITATION = {
  short: 'McLeod & Crowe (2018)',
  full: "McLeod, S., & Crowe, K. (2018). Children's consonant acquisition in 27 "
      + 'languages: A cross-linguistic review. American Journal of Speech-Language '
      + 'Pathology, 27(4), 1546-1571.',
  doi: 'https://doi.org/10.1044/2018_AJSLP-17-0100',
  criterion: '90% mastery, all-positions criterion',
};

/** months -> "3;6" (the years;months convention every SLP report uses) */
export const ageLabel = (m) => `${Math.floor(m / 12)};${String(m % 12).padStart(2, '0')}`;

/** A friendlier form for a parent who has never seen "5;06" written down. */
export const ageWords = (m) => {
  const y = Math.floor(m / 12), mo = m % 12;
  if (!mo) return `${y} years old`;
  if (mo === 6) return `${y} and a half`;
  return `${y} years ${mo} months`;
};

/**
 * The 24 English consonants, by kide's phoneme code where one exists.
 * `mastery` is months. `letters` is what a parent would call it.
 */
export const NORMS = {
  p: { ipa: 'p', letters: 'p',  mastery: 36, family: 'stop',        example: 'pig' },
  b: { ipa: 'b', letters: 'b',  mastery: 36, family: 'stop',        example: 'ball' },
  m: { ipa: 'm', letters: 'm',  mastery: 36, family: 'nasal',       example: 'mom' },
  n: { ipa: 'n', letters: 'n',  mastery: 36, family: 'nasal',       example: 'no' },
  h: { ipa: 'h', letters: 'h',  mastery: 36, family: 'fricative',   example: 'hat' },
  w: { ipa: 'w', letters: 'w',  mastery: 36, family: 'approximant', example: 'wet' },
  d: { ipa: 'd', letters: 'd',  mastery: 36, family: 'stop',        example: 'dog' },
  t: { ipa: 't', letters: 't',  mastery: 42, family: 'stop',        example: 'top' },
  k: { ipa: 'k', letters: 'k',  mastery: 42, family: 'stop',        example: 'cat' },
  g: { ipa: 'ɡ', letters: 'g',  mastery: 42, family: 'stop',        example: 'go' },
  ng: { ipa: 'ŋ', letters: 'ng', mastery: 42, family: 'nasal',      example: 'ring' },
  f: { ipa: 'f', letters: 'f',  mastery: 48, family: 'fricative',   example: 'fish' },
  y: { ipa: 'j', letters: 'y',  mastery: 48, family: 'approximant', example: 'yes' },
  l: { ipa: 'l', letters: 'l',  mastery: 60, family: 'liquid',      example: 'leaf' },
  v: { ipa: 'v', letters: 'v',  mastery: 60, family: 'fricative',   example: 'van' },
  sh: { ipa: 'ʃ', letters: 'sh', mastery: 60, family: 'fricative',  example: 'shoe' },
  ch: { ipa: 'tʃ', letters: 'ch', mastery: 60, family: 'affricate', example: 'chip' },
  j: { ipa: 'dʒ', letters: 'j', mastery: 60, family: 'affricate',   example: 'jump' },
  s: { ipa: 's', letters: 's',  mastery: 66, family: 'fricative',   example: 'sun' },
  z: { ipa: 'z', letters: 'z',  mastery: 66, family: 'fricative',   example: 'zoo' },
  r: { ipa: 'ɹ', letters: 'r',  mastery: 72, family: 'liquid',      example: 'red' },
  th: { ipa: 'θ', letters: 'th', mastery: 84, family: 'fricative',  example: 'thumb' },
  dh: { ipa: 'ð', letters: 'th', mastery: 84, family: 'fricative',  example: 'this' },
  zh: { ipa: 'ʒ', letters: 'zh', mastery: 84, family: 'fricative',  example: 'measure' },
};

/**
 * The single most valuable sentence on any of these pages.
 *
 * Deliberately worded so that "on time" is the loud part. A parent arriving
 * from a search for "4 year old can't say r" should be able to stop reading
 * after one line and feel better, having been told the truth.
 */
export function verdictFor(code, ageMonths) {
  const n = NORMS[code];
  if (!n) return null;
  if (!ageMonths) {
    return { state: 'unknown',
      line: `Most children have "${n.letters}" by about ${ageWords(n.mastery)}.` };
  }
  const gap = n.mastery - ageMonths;
  if (gap > 0) {
    return { state: 'early',
      line: `This is on time. Most children don't have "${n.letters}" until about `
          + `${ageWords(n.mastery)} — so at ${ageWords(ageMonths)}, not saying it yet `
          + 'is what the research would expect.' };
  }
  if (gap > -12) {
    return { state: 'due',
      line: `"${n.letters}" usually arrives around ${ageWords(n.mastery)}, so this is `
          + 'about the age it tends to settle. Plenty of children take a little longer '
          + 'and are still perfectly typical.' };
  }
  return { state: 'late',
    line: `Most children have "${n.letters}" by about ${ageWords(n.mastery)}. If it `
        + "hasn't arrived by now, it's worth mentioning to your doctor or a "
        + "speech-language pathologist — not because something is wrong, but "
        + "because that's the person who can actually tell you." };
}

/** The four groups every SLP handout uses, in the order a child acquires them. */
export const STAGES = [
  { name: 'Early sounds', by: 36, codes: ['p', 'b', 'm', 'n', 'h', 'w', 'd'] },
  { name: 'Next sounds', by: 42, codes: ['t', 'k', 'g', 'ng'] },
  { name: 'Middle sounds', by: 48, codes: ['f', 'y'] },
  { name: 'Later sounds', by: 66, codes: ['l', 'v', 'sh', 'ch', 'j', 's', 'z'] },
  { name: 'Latest sounds', by: 84, codes: ['r', 'th', 'dh', 'zh'] },
];

/**
 * What a child says INSTEAD, and what that pattern is called.
 *
 * This is the higher-intent half of the search. A worried parent does not type
 * "the k sound" -- they type what they actually hear: "my child says tat for
 * cat", "says wabbit instead of rabbit". Those searches carry more worry and
 * far less competition than the sound name.
 *
 * They are also the easiest worry to answer honestly, because these are not
 * random errors. They are named, documented developmental patterns that
 * resolve on their own at known ages, and telling a parent "that has a name,
 * it's extremely common, and it usually goes by about four" is both true and
 * the most useful sentence they will read that night.
 *
 * `by` is the age (in months) by which the pattern has typically resolved.
 * Sources: standard phonological process descriptions as used in clinical
 * practice, consistent with the acquisition ages above.
 */
export const SUBSTITUTIONS = {
  k:  { says: 't',      name: 'velar fronting',  by: 42, eg: ['cat', 'tat'] },
  g:  { says: 'd',      name: 'velar fronting',  by: 42, eg: ['go', 'doe'] },
  r:  { says: 'w',      name: 'gliding',         by: 72, eg: ['rabbit', 'wabbit'] },
  l:  { says: 'w or y', name: 'gliding',         by: 60, eg: ['leaf', 'weaf'] },
  s:  { says: 't',      name: 'stopping',        by: 42, eg: ['sun', 'tun'] },
  f:  { says: 'p',      name: 'stopping',        by: 42, eg: ['fish', 'pish'] },
  sh: { says: 's',      name: 'palatal fronting', by: 54, eg: ['shoe', 'soo'] },
  ch: { says: 't',      name: 'stopping',        by: 54, eg: ['chip', 'tip'] },
  v:  { says: 'b',      name: 'stopping',        by: 42, eg: ['van', 'ban'] },
  z:  { says: 'd',      name: 'stopping',        by: 42, eg: ['zoo', 'doo'] },
  th: { says: 'f',      name: 'stopping',        by: 84, eg: ['thumb', 'fumb'] },
  dh: { says: 'd or v', name: 'stopping',        by: 84, eg: ['this', 'dis'] },
  j:  { says: 'd',      name: 'stopping',        by: 54, eg: ['jump', 'dump'] },
  t:  { says: 'd',      name: 'voicing',         by: 36, eg: ['top', 'dop'] },
  p:  { says: 'b',      name: 'voicing',         by: 36, eg: ['pig', 'big'] },
};
