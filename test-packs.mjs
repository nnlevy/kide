// Letters and Feelings — the two packs whose content is a research claim.
//
// Colors, counting and shapes are self-evident: red is red. These two are not.
// Their difficulty ordering encodes findings about how children actually
// acquire letters and emotion words, and the ordering is the entire value of
// the packs. A well-meaning edit that alphabetises the letter tiers, or adds
// "disgusted" because it rounds out the set, would leave a game that still
// runs perfectly and no longer teaches in the order children learn.
//
// So these assertions are about the claims, not the plumbing:
//
//   LETTERS. Tier 1 must stay acrophonically transparent (the letter's sound
//   at the start of its name), visually unconfusable, and seeded from the
//   child's own companion name — the own-name advantage is the largest effect
//   available here and it is free.
//
//   FEELINGS. Tiers must follow the differentiation sequence Widen & Russell
//   replicated across three samples: happy first, then sad/angry, then fear,
//   then surprise. Disgust is last in children and is deliberately absent.
//   Tier 1 must be situations rather than faces, because young children read
//   emotions from what happened well before they can read them off a face.
//
// The pack logic lives inside a single-file IIFE with no module boundary, so
// it is sliced out of the page and run against stubs. That is uglier than an
// import and much better than reimplementing the logic in the test, which
// would only ever prove the test agrees with itself.

import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import vm from 'node:vm';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

const page = readFileSync('public/play/index.html', 'utf8');
const manifest = readFileSync('tools/voice/manifest.js', 'utf8');

/* ---- lift the pack code out of the page, unmodified ----------------------
   Two precise slices rather than one wide one: the region between them holds
   the page's bootstrap (fetch of play-targets.json, dynamic import of the
   journal), which has no business running in a test and cannot anyway. */
const slice = (startMark, endMark) => {
  const a = page.indexOf(startMark);
  const b = page.indexOf(endMark, a + 1);
  assert(a > -1, `could not find "${startMark}" in play/index.html`);
  assert(b > a, `could not find "${endMark}" after it`);
  return page.slice(a, b);
};
const source = [
  slice('const COLORS = {', "/* ========================= PIP'S TURN"),
  slice('function newQuestion(', 'function shapeSvg('),
  // `const` is block-scoped and never lands on the sandbox object, so the
  // tables are handed over explicitly. Appended to the lifted source rather
  // than added to the page: the page owes a test nothing.
  `Object.assign(globalThis, { LETTER_CV, LETTER_VC, LETTER_VOWEL, LETTER_OPAQUE,
     ALL_LETTERS, LETTER_CONFUSABLE, LETTER_TIERS,
     FEELINGS, FEELING_TIERS, FEELING_STORIES });`,
].join('\n');

let companionName = null;
const sandbox = {
  // Utilities the page defines elsewhere. Deterministic order is not wanted
  // here — the point is to hammer the real random paths.
  pick: (a) => a[Math.floor(Math.random() * a.length)],
  shuffle: (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; },
  wordsCompanionName: () => companionName,
  state: { question: null, missOnQuestion: 0, qSerial: 0 },
  progress: {},
  listenTries: 0,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const ask = (level, tier) => {
  sandbox.progress[level] = { tier, streak: 0, miss: 0, best: 1 };
  sandbox.newQuestion(level);
  return sandbox.state.question;
};
const many = (level, tier, n = 400) => Array.from({ length: n }, () => ask(level, tier));

console.log('\nletters are ordered the way children learn them, not A to Z');

t('tier 1 is acrophonically transparent — the sound is at the START of the name', () => {
  // Treiman: children give the sounds of CV-name letters (B "bee", D "dee")
  // more readily than VC-name letters (F "ef", M "em"), and most readily of
  // all compared with letters whose name contains no clue (H, W, Y).
  const cv = new Set(sandbox.LETTER_CV);
  for (const l of sandbox.LETTER_TIERS[1].pool) {
    assert(cv.has(l), `tier 1 contains "${l}", which is not a CV-name letter`);
  }
});

t('the opaque letters are last, not sprinkled through', () => {
  // H "aitch", W "double-u", Y "wy" — the name tells a child nothing about the
  // letter. They belong at the end of the gradient.
  for (const l of sandbox.LETTER_OPAQUE) {
    assert(!sandbox.LETTER_TIERS[1].pool.includes(l), `opaque letter "${l}" is in tier 1`);
    assert(!sandbox.LETTER_TIERS[2].pool.includes(l), `opaque letter "${l}" is in tier 2`);
  }
  assert(sandbox.LETTER_TIERS[4].pool.length === 26, 'the last tier is not the whole alphabet');
});

t('an early question never asks a child to tell two look-alike letters apart', () => {
  // E/F, M/W, O/Q, P/R, C/G. Uppercase spares us b/d/p/q, but not these — and
  // telling two similar letters apart is a later task than recognising one.
  //
  // Guaranteed twice over, and the distinction matters. The pools for tiers 1
  // and 2 contain no confusable pair AT ALL, so the property holds by
  // construction; the avoidConfusable flag is a second line of defence for the
  // day somebody widens a pool. Mutation-testing this file showed the runtime
  // check alone never fires against the current pools — a test that only
  // exercised it would have been asserting nothing.
  for (const tier of [1, 2]) {
    const pool = sandbox.LETTER_TIERS[tier].pool;
    for (const l of pool) {
      const bad = (sandbox.LETTER_CONFUSABLE[l] || []).filter((x) => pool.includes(x));
      assert.equal(bad.length, 0,
        `tier ${tier} pool contains "${l}" and its look-alike "${bad.join(',')}"`);
    }
    assert(sandbox.LETTER_TIERS[tier].avoidConfusable,
      `tier ${tier} has lost the avoidConfusable guard that protects future pool edits`);
    // And the generated questions agree, which is what a child actually meets.
    for (const q of many('letters', tier)) {
      const bad = sandbox.LETTER_CONFUSABLE[q.target] || [];
      const clash = q.options.filter((o) => o !== q.target && bad.includes(o));
      assert.equal(clash.length, 0,
        `tier ${tier}: "${q.target}" was offered alongside "${clash.join(',')}"`);
    }
  }
});

t('the child\'s own companion name drives tier 1 when there is one', () => {
  // The own-name advantage: children know the letters of their own name first,
  // and the first letter best of all. This game already has a name the child
  // chose and cares about, so tier 1 uses it.
  companionName = 'Momo';
  const targets = new Set(many('letters', 1).map((q) => q.target));
  companionName = null;
  assert(targets.has('M') || targets.has('O'),
    'no letter from the companion name ever came up in tier 1');
  const flagged = many('letters', 1);
  companionName = 'Momo';
  const withName = many('letters', 1).filter((q) => q.fromName);
  companionName = null;
  assert(withName.length > 0, 'no question was ever marked as coming from the name');
  assert(flagged.every((q) => !q.fromName || q.fromName),
    'fromName is set inconsistently');
});

t('with no companion name it still works, and claims no name', () => {
  companionName = null;
  const qs = many('letters', 1);
  assert(qs.every((q) => !q.fromName), 'a question claimed a name that does not exist');
  assert(qs.every((q) => q.options.includes(q.target)), 'the answer was not among the options');
});

console.log('\nfeelings follow the sequence children actually acquire');

t('tier 1 is the first split a child makes: happy and sad', () => {
  assert.deepEqual(sandbox.FEELING_TIERS[1].pool.slice().sort(), ['happy', 'sad']);
});

t('anger arrives before fear, and fear before surprise', () => {
  // Widen & Russell: one label means happy; then sad or angry; then all three;
  // then fear or surprise. 81/78/86% of children across three samples.
  const at = (n) => sandbox.FEELING_TIERS[n].pool;
  assert(at(2).includes('angry'), 'anger is not introduced at tier 2');
  assert(!at(2).includes('scared'), 'fear appears at tier 2, before anger is established');
  assert(at(3).includes('scared'), 'fear is not introduced at tier 3');
  assert(!at(3).includes('surprised'), 'surprise appears before fear is established');
  assert(at(4).includes('surprised'), 'surprise is never introduced');
});

t('disgust is absent — it is acquired last and this is not the audience for it', () => {
  for (const n of [1, 2, 3, 4]) {
    assert(!sandbox.FEELING_TIERS[n].pool.includes('disgusted'),
      `disgust appears at tier ${n}`);
  }
  assert(!('disgusted' in sandbox.FEELINGS), 'disgust has been added to the feeling set');
});

t('tier 1 asks about situations, never about a face', () => {
  // Children label emotions from what happened earlier and more accurately
  // than from a facial expression. Opening with faces would make the easiest
  // tier the hardest task.
  const qs = many('feelings', 1);
  assert(qs.every((q) => q.type === 'feelings-story'),
    'a face question appeared in tier 1');
  assert(qs.every((q) => q.story && q.story.text), 'a tier 1 question carried no situation');
});

t('faces appear once the categories exist, and both forms stay in play', () => {
  const kinds = new Set(many('feelings', 3).map((q) => q.type));
  assert(kinds.has('feelings-face'), 'faces never appear at tier 3');
  assert(kinds.has('feelings-story'), 'situations stop being asked at tier 3');
});

t('every situation resolves to a feeling that is offered at its tier', () => {
  for (const tier of [1, 2, 3, 4]) {
    for (const q of many('feelings', tier, 200)) {
      assert(q.options.includes(q.target), 'the feeling asked about was not offered');
      assert(new Set(q.options).size === q.options.length, 'an option was repeated');
      if (q.story) {
        assert.equal(q.story.feel, q.target, 'the story and the answer disagree');
        assert(sandbox.FEELING_TIERS[tier].pool.includes(q.story.feel),
          `tier ${tier} told a "${q.story.feel}" story, which is not in its pool`);
      }
    }
  }
});

t('no situation is frightening, punitive, or about the child\'s own family', () => {
  // The scared items are a loud dog, a dark room and thunder — all ordinary and
  // all resolved in the telling. Nothing here should describe a child being
  // hurt, told off, or losing a person.
  const BANNED = /\b(hit|hurt|smack|blood|die|died|dead|kill|mummy|mum|daddy|dad|mother|father|hospital|blame|naughty|bad boy|bad girl)\b/i;
  for (const s of sandbox.FEELING_STORIES) {
    assert(!BANNED.test(s.text), `"${s.text}" is not a situation for a two-year-old`);
    assert(s.text.length < 70, `"${s.text}" is too long to hold in a toddler's head`);
  }
});

t('every feeling has a face, drawn rather than typed', () => {
  // An emotion-recognition task cannot rest on emoji: the same codepoint is a
  // visibly different expression on iOS, Android and Windows.
  for (const key of Object.keys(sandbox.FEELINGS)) {
    const svg = sandbox.feelingSvg(key);
    assert(/^<svg /.test(svg), `${key} has no drawn face`);
    assert(/<circle[^>]*r="46"/.test(svg), `${key} is missing the head`);
    assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(svg), `${key} contains an emoji`);
  }
  const shapes = new Set(Object.keys(sandbox.FEELINGS).map((k) => sandbox.feelingSvg(k)));
  assert.equal(shapes.size, Object.keys(sandbox.FEELINGS).length,
    'two feelings render an identical face');
});

console.log('\nPip can say all of it');

t('every letter prompt has a voice line', () => {
  const missing = sandbox.ALL_LETTERS
    .filter((l) => !manifest.includes(`"prompt-letter-${l.toLowerCase()}"`));
  assert.equal(missing.length, 0, `no voice line for: ${missing.join(', ')}`);
});

t('every feeling and every situation has a voice line', () => {
  for (const key of Object.keys(sandbox.FEELINGS)) {
    assert(manifest.includes(`"prompt-feeling-${key}"`), `no voice line for feeling ${key}`);
  }
  // The situation IS the prompt — a pre-reader cannot read it off the card, so
  // a missing clip here is a silent question rather than a cosmetic gap.
  for (const s of sandbox.FEELING_STORIES) {
    assert(manifest.includes(`"${s.id}"`), `no voice line for situation ${s.id}`);
  }
  for (const id of ['listen-letter', 'listen-feeling']) {
    assert(manifest.includes(`"${id}"`), `no voice line for ${id}`);
  }
});

t('the story text on screen is the story text Pip says', () => {
  // Two copies of the same sentence, in two files. They drift silently, and the
  // failure is a child hearing one thing and a parent reading another.
  for (const s of sandbox.FEELING_STORIES) {
    const line = manifest.match(new RegExp(`id:\\s*"${s.id}",\\s*text:\\s*"([^"]*)"`));
    assert(line, `manifest line for ${s.id} could not be parsed`);
    assert.equal(line[1].replace(/\.\.\./g, '').replace(/\s+/g, ' ').trim(),
      s.text.replace(/\s+/g, ' ').trim(),
      `${s.id}: the spoken line and the on-screen line differ`);
  }
});

console.log('\nthe new packs cannot contaminate the clinical record');

t('no letter or feeling is a word the speech record would attribute to a sound', () => {
  // recordPractice() looks the answer up in play-targets.json and ignores
  // anything it cannot attribute. If a letter or feeling name ever collided
  // with a lexicon word, taps in these packs would silently enter a child's
  // practice record as speech attempts and inflate an SLP's adherence figures.
  const targets = JSON.parse(readFileSync('public/data/play-targets.json', 'utf8'));
  const keys = new Set(Object.keys(targets).map((k) => k.toLowerCase()));
  for (const l of sandbox.ALL_LETTERS) {
    assert(!keys.has(l.toLowerCase()), `letter "${l}" is also a speech-practice word`);
  }
  for (const f of Object.keys(sandbox.FEELINGS)) {
    assert(!keys.has(f), `feeling "${f}" is also a speech-practice word`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
