// What is actually different about each sound.
//
// WHY THIS FILE EXISTS. The first version of /sounds generated sixteen pages
// from one template with the letter and the age swapped in. Every page was
// accurate, well-written and interchangeable — which is thin content by any
// definition, and the portfolio deploy gate blocked the release for exactly
// that ("duplicate-copy: same text in public/sounds/ch/ and public/sounds/r/").
// The gate was right. Sixteen pages that say the same thing rank as one page
// and deserve to.
//
// The fix is not paraphrase. Each sound genuinely IS different, in ways a
// parent can use tonight:
//
//   - WHERE IT IS MADE. "k" happens at the back of the tongue against the soft
//     palate; "f" happens at the front where anyone can see it. That single
//     fact decides whether "watch my mouth" is useful advice or useless advice,
//     and nobody tells parents which is which.
//   - WHETHER IT HAS A TWIN. p/b, t/d and k/g are the same mouth movement with
//     the voice off and on. A child saying "big" for "pig" already has the
//     whole articulation and is only leaving the voice running — which is a
//     completely different situation from not having the sound, and much less
//     alarming once somebody says so.
//   - WHAT IS SPECIFICALLY TRUE OF IT. "l" is two different jobs (leaf vs
//     ball). "r" is several sounds wearing one letter. "s" has two lisps and
//     only one of them resolves on its own. These are the sentences a parent
//     came for.
//
// TONE RULES, inherited from docs/BRAND.md and enforced by test-seo.mjs: no
// word from the banned list (diagnos*, cure, treat*, guarantee, falling behind,
// delayed), reassurance above the first subheading, every age matching
// norms.js, and no claim that Kide is anything other than practice.
//
// One phrasing trap worth knowing before editing: test-seo.mjs scans for
// "by about <N> years" and requires every match to equal THIS sound's mastery
// age. Any other age in the copy — a pattern's resolution age, a referral age —
// must be phrased differently ("by around", "at about", "past their fifth
// birthday"). That is not pedantry; it is what stops a page quoting one sound's
// norm while describing another's.

/**
 * `heading`  replaces the identical "What the research says" h2. Carries the
 *            page's distinct idea, so the section is worth its own scroll.
 * `angle`    a short clause for the <title>, so sixteen titles are not one title.
 * `mouth`    how the sound is physically produced, in words a parent can act on.
 * `seen`     'visible' | 'hidden' | 'partly' — decides the mirror advice, which
 *            is genuinely different per sound and almost always given wrongly.
 * `twin`     voiceless/voiced partner, where the pair is the interesting fact.
 * `insight`  the paragraph that justifies the page existing. One idea, true,
 *            specific to this sound, and not obtainable from the norms table.
 * `tip`      a concrete thing to do tonight. No equipment, no drilling.
 * `faq`      extra question/answer pairs specific to this sound.
 * `source`   optional second citation, where a claim needs one beyond the norms.
 */
export const SOUND_NOTES = {
  /* ---- bilabials: the first sounds, and the easiest to show ------------- */
  p: {
    heading: 'A puff of air you can actually see',
    angle: 'the puff of air you can see',
    mouth: 'Both lips press shut, pressure builds behind them, and they pop apart with a '
         + 'little burst of air.',
    seen: 'visible',
    twin: { letters: 'b', same: 'the lips do exactly the same thing', diff: 'the voice is switched off for "p" and on for "b"' },
    insight:
      'Hold a strip of tissue paper in front of your mouth and say "pig". It flutters. Say '
      + '"big" and it barely moves. That puff is the entire difference between the two sounds — '
      + 'the lips, the tongue and the jaw are doing something identical. So a child who says '
      + '"big" for "pig" is not missing a sound at all. They have the whole mouth movement '
      + 'already and are simply leaving the voice running through it, which is why this one '
      + 'tends to sort itself out early and quietly.',
    tip: 'Tear a strip of tissue, hold it at your lips, and take turns making it dance. '
       + 'It turns an invisible difference into a game with a visible answer.',
    faq: [[
      'My child says "big" instead of "pig". Is that a problem with their lips?',
      'No — the lips are doing the right thing. "p" and "b" are made identically; the only '
      + 'difference is whether the voice box is running. Your child has the movement and is '
      + 'leaving the voice on. That is called voicing, and it is one of the earliest patterns '
      + 'to settle on its own.',
    ]],
  },

  b: {
    heading: 'One of the first sounds in almost every language',
    angle: 'one of the first sounds children make',
    mouth: 'Lips together, voice already humming, then the lips release.',
    seen: 'visible',
    twin: { letters: 'p', same: 'the lips do exactly the same thing', diff: 'the voice runs for "b" and stops for "p"' },
    insight:
      'Across the 27 languages in the acquisition review, sounds made with the lips arrive '
      + 'first almost everywhere. There is a mechanical reason: a baby can see lips. Every '
      + 'feeding, every face leaning over the cot, every exaggerated smile is a demonstration. '
      + 'Sounds made behind the teeth get no such tuition. This is also why "ba" shows up in '
      + 'babble long before it means anything — the babble is practice for the machinery, not '
      + 'an attempt at a word.',
    tip: 'Put your child\'s hand on your throat and say a long "bbbb". They feel the buzz. '
       + 'Move their hand to their own throat and let them find it.',
    faq: [[
      'My baby says "bababa" all day. Does that count as saying "b"?',
      'It counts as practice, which is what matters at that stage. Babble is a child '
      + 'rehearsing the machinery before attaching it to meaning. Sounds made with the lips '
      + 'lead almost every language\'s order because a child can watch a face make them.',
    ]],
  },

  m: {
    heading: 'The only sound you can make with your mouth shut',
    angle: 'the sound you can make with your mouth closed',
    mouth: 'Lips closed, voice on, and the air goes out through the nose instead of the mouth.',
    seen: 'visible',
    insight:
      'Ask your child to hum with their lips together and they are already making a perfect '
      + '"m" — it needs no tongue placement, no air stream through the mouth, and no timing. '
      + 'What it does need is a clear nose. That is why "m" is the first sound to vanish '
      + 'during a cold: "bummy" for "mummy" during a blocked week is plumbing, not speech '
      + 'development, and it comes back with the sniffle.',
    tip: 'Hum a tune together with lips closed, then open your lips mid-hum. The hum turns '
       + 'into a vowel and back. Children find the switch funny and it is the sound itself.',
    faq: [[
      'My child says "bummy" instead of "mummy" when they have a cold. Should I worry?',
      'No. "m" needs air to leave through the nose, so a blocked nose has nowhere to send it '
      + 'and the sound turns into "b". It is mechanical and it comes back when the cold does.',
    ]],
  },

  /* ---- alveolars: the tongue tip finds the ridge ------------------------ */
  n: {
    heading: 'What a blocked nose does to "n"',
    angle: 'what a cold does to it',
    mouth: 'Tongue tip presses up behind the top teeth, voice on, air out through the nose.',
    seen: 'partly',
    insight:
      '"n" and "m" are the same idea in two places: close the mouth somewhere, send the voice '
      + 'out through the nose. "m" closes at the lips, "n" closes with the tongue. Both depend '
      + 'entirely on a clear nose, which is why a stuffy week turns "nose" into "dose" and '
      + '"no" into "doe". Parents often read that as a speech change; it is a nose change.',
    tip: 'Pinch your own nose gently and try to say "no". It comes out "doe" and the '
       + 'impossibility is funny. Children work out where the sound lives immediately.',
    faq: [[
      'Why does my child say "dose" instead of "nose" when blocked up?',
      '"n" sends the voice out through the nose. If the nose is blocked, the air has to go '
      + 'through the mouth instead, and "n" becomes "d". It is the plumbing, not the speech.',
    ]],
  },

  d: {
    heading: 'Where a lot of other sounds land on the way',
    angle: 'the sound other sounds turn into first',
    mouth: 'Tongue tip taps the bumpy ridge behind the top teeth, with the voice on.',
    seen: 'hidden',
    twin: { letters: 't', same: 'the tongue taps the same spot', diff: 'the voice runs for "d" and stops for "t"' },
    insight:
      'If you are hearing a lot of "d" in your child\'s speech, that is usually a sign of '
      + 'ordinary simplification rather than a missing sound. "d" is where several documented '
      + 'patterns come to rest: "go" becomes "doe" when the back of the tongue is not in play '
      + 'yet, "zoo" becomes "doo" and "jump" becomes "dump" when a long sound is shortened '
      + 'into a tap. Different patterns, same landing place — which is why one child can seem '
      + 'to over-use a single sound while three separate things are quietly resolving.',
    tip: 'Knock on a table while you say "d-d-d". The tongue tap and the knock have the same '
       + 'rhythm, and children copy rhythm long before they copy placement.',
    faq: [[
      'My child seems to say "d" for everything. Is that one problem or several?',
      'Usually several ordinary patterns landing on the same sound. "doe" for "go" is the back '
      + 'of the tongue not being used yet; "doo" for "zoo" and "dump" for "jump" are long '
      + 'sounds being shortened into a tap. Each resolves on its own timetable.',
    ]],
  },

  t: {
    heading: 'The most borrowed sound in English',
    angle: 'the stand-in for half the alphabet',
    mouth: 'Tongue tip taps the ridge behind the top teeth and releases a small puff of air.',
    seen: 'hidden',
    twin: { letters: 'd', same: 'the tongue taps the same spot', diff: 'the voice stops for "t" and runs for "d"' },
    insight:
      'More sounds get replaced by "t" than by anything else in English child speech. "cat" '
      + 'becomes "tat" when the back of the tongue is not in play. "sun" becomes "tun" and '
      + '"chip" becomes "tip" when a long sound gets shortened into a tap. Three completely '
      + 'separate patterns, one destination. It is worth knowing because a child who says all '
      + 'three sounds like a child with a big problem, and is in fact a child doing three '
      + 'small ordinary things that resolve at three different ages.',
    tip: 'Tick like a clock — "t, t, t" — and let your child be the second hand. The tap is '
       + 'the sound, and the rhythm carries it without anyone being asked to perform.',
    faq: [[
      'My child replaces lots of sounds with "t". Is that one thing or many?',
      'Usually several. "tat" for "cat" is the back of the tongue; "tun" for "sun" and "tip" '
      + 'for "chip" are long sounds being shortened. They are documented patterns with '
      + 'different timetables, which is why they disappear one at a time rather than together.',
    ]],
  },

  /* ---- velars: the invisible ones --------------------------------------- */
  k: {
    heading: 'Why you cannot show your child this one in a mirror',
    angle: 'the sound you cannot demonstrate',
    mouth: 'The BACK of the tongue humps up to meet the soft palate, right at the back of the '
         + 'mouth, and releases.',
    seen: 'hidden',
    twin: { letters: 'g', same: 'the back of the tongue meets the same spot', diff: 'the voice stops for "k" and runs for "g"' },
    insight:
      'Every piece of advice that starts "sit in front of a mirror and watch my mouth" is '
      + 'useless here, and being told that saves a lot of frustrating evenings. There is '
      + 'nothing to see: the whole event happens behind the tongue, out of sight, with the '
      + 'lips and jaw doing nothing informative. That invisibility is the reason children '
      + 'substitute the nearest sound they CAN see and feel — "tat" for "cat" — and the reason '
      + 'this particular swap is the most studied pattern in child speech.',
    tip: 'Lie your child on their back on the floor and play there for a bit. Gravity pulls '
       + 'the tongue body backwards, and the sound often turns up on its own without anyone '
       + 'having to explain where it lives. A pretend cough — "ackk" — works the same way.',
    faq: [[
      'My child says "tat" for "cat". Everyone tells me to use a mirror.',
      'A mirror will not help with this one — "k" is made at the back of the tongue where '
      + 'there is nothing to see. That is exactly why children swap in a sound they can see '
      + 'and feel. Lying on their back, or a pretend cough, gets at it far better than '
      + 'watching a mouth.',
    ], [
      'At what point is "tat" for "cat" worth mentioning?',
      'Sounds made at the back of the tongue are typically in place somewhere between two and '
      + 'four. If you are hearing no back-of-tongue sounds at all once your child is three, '
      + 'that is worth raising with your doctor — not as an emergency, but because it is one '
      + 'of the few early signs that is genuinely useful to check.',
    ]],
    // No second citation here on purpose. An earlier draft attached a specific
    // journal reference to this page; the reference had not been checked and
    // was removed rather than shipped. Everything claimed above is either basic
    // articulatory phonetics (the back of the tongue is not visible) or already
    // covered by the acquisition review cited on every page. A health-adjacent
    // page for worried parents is the last place to carry a citation nobody
    // verified.
  },

  g: {
    heading: 'The sound that hides at the back of the mouth',
    angle: 'the one you can hear but not see',
    mouth: 'The back of the tongue rises to the soft palate with the voice already running, '
         + 'then lets go.',
    seen: 'hidden',
    twin: { letters: 'k', same: 'the back of the tongue meets the same spot', diff: 'the voice runs for "g" and stops for "k"' },
    insight:
      'Like its twin, "g" happens entirely out of view, so a child has no way to copy it by '
      + 'watching. What they do instead is substitute the closest sound they can place with '
      + 'confidence — the tongue tip — and "go" becomes "doe". Notice that the swap is not '
      + 'random or lazy: it keeps the voicing, keeps the rhythm, and moves only the one thing '
      + 'the child cannot yet aim at. That is a child solving a problem, not failing a task.',
    tip: 'Gargle-play at bath time, or a dramatic "glug glug glug" as a cup empties. Both put '
       + 'the tongue in the right place while nobody is being asked to say anything.',
    faq: [[
      'My child says "doe" for "go" and "dot" for "got". Same issue?',
      'Yes, the same one. The back of the tongue is not in play yet, so the tongue tip stands '
      + 'in for it. The child keeps everything else about the word intact and moves only the '
      + 'part they cannot yet aim at.',
    ]],
  },

  /* ---- fricatives and the stretch/pop distinction ------------------------ */
  h: {
    heading: 'The one consonant with no moving parts',
    angle: 'the consonant with nothing to place',
    mouth: 'Nothing touches anything. It is breath, shaped by whatever vowel follows it.',
    seen: 'hidden',
    insight:
      '"h" is unique in English: no lips, no tongue placement, no contact anywhere. That makes '
      + 'it one of the earliest sounds to arrive and also one of the easiest to lose without '
      + 'anybody noticing, because a dropped "h" leaves a word that still sounds like a word — '
      + '"at" for "hat". Worth knowing too that dropping it at the start of words is a feature '
      + 'of plenty of perfectly ordinary accents across the English-speaking world, so an '
      + 'adult in the house may be modelling exactly what the child is doing.',
    tip: 'Fog up a cold window or a mirror and draw in it. The fog only appears with a proper '
       + 'breathy "h", so the sound produces its own reward and nobody has to judge it.',
    faq: [[
      'My child drops the "h" at the start of words. Is that a speech issue or an accent?',
      'It can honestly be either. Dropping "h" at the start of words is a normal feature of '
      + 'many English accents, so it is worth listening to how the adults around your child '
      + 'say those words before treating it as anything else.',
    ]],
  },

  f: {
    heading: 'Sounds you can stretch, and sounds that pop',
    angle: 'the first sound your child can stretch',
    mouth: 'Top teeth rest lightly on the bottom lip and air hisses out between them.',
    seen: 'visible',
    twin: { letters: 'v', same: 'the teeth and lip do the same thing', diff: 'the voice runs for "v" and stops for "f"' },
    insight:
      'Up to this point almost every sound a child owns is a pop: lips or tongue close, '
      + 'pressure builds, it releases. "f" is a different kind of thing entirely — you can hold '
      + 'it for as long as you have breath. That distinction, between sounds that burst and '
      + 'sounds you can stretch, is the actual developmental step here, and it is why "pish" '
      + 'for "fish" is such a common way-station: the child has the right lip and teeth but is '
      + 'still releasing it as a pop instead of letting it run.',
    tip: 'Have a competition to hold "ffffff" the longest. It is the one sound at this stage '
       + 'you can compete on for duration, and length is the exact thing being learned.',
    faq: [[
      'My child says "pish" for "fish". What are they actually doing?',
      'Turning a stretchy sound into a pop. The lips and teeth are close to right; the '
      + 'difference is that "f" needs to run continuously and "p" bursts. Holding a long '
      + '"ffff" playfully targets exactly the part that is missing.',
    ]],
  },

  s: {
    heading: 'Two different lisps, and only one sorts itself out',
    angle: 'the two lisps, and which one to mention',
    mouth: 'The tongue tip sits close to — not touching — the ridge behind the top teeth, and '
         + 'air travels down a narrow groove along the middle of the tongue.',
    seen: 'partly',
    twin: { letters: 'z', same: 'the tongue makes the same narrow groove', diff: 'the voice runs for "z" and stops for "s"' },
    insight:
      'This is the one page on this site where the useful thing is a distinction, so here it '
      + 'is plainly. If your child pushes their tongue between their teeth and "sun" comes out '
      + 'as "thun", that is an interdental lisp: extremely common, and it typically resolves on '
      + 'its own by around four and a half. If instead the sound comes out wet or slushy, with '
      + 'the air escaping over the sides of the tongue rather than down the middle, that is a '
      + 'lateral lisp — and a lateral lisp is not a stage children pass through. It does not '
      + 'usually resolve by itself at any age, so it is worth mentioning to a speech-language '
      + 'pathologist whenever you notice it rather than waiting to see. Most parents are never '
      + 'told there are two, and wait out the one that does not go away.',
    tip: 'Snake play — a long "ssss" with teeth lightly closed. Closed teeth make the '
       + 'between-the-teeth version physically difficult without anyone being corrected.',
    faq: [[
      'How do I tell which kind of lisp my child has?',
      'Listen for where the air goes. Tongue poking between the teeth with a "th"-like sound '
      + 'is the interdental kind, and it usually sorts itself out by around four and a half. '
      + 'A wet, slushy sound with air spilling over the sides of the tongue is a lateral lisp, '
      + 'and that one does not typically resolve on its own — worth raising whenever you '
      + 'notice it.',
    ], [
      'My five-year-old still says "thun" for "sun". Is that still fine?',
      'It is past the age most children have moved on, so it is reasonable to mention it at '
      + 'your next appointment. That is not cause for alarm — plenty of children get there a '
      + 'little later — it just means a professional is now the right person to ask rather '
      + 'than the internet.',
    ]],
    // Verified 2026-08-02: title and URL both confirmed against the site's own
    // Clinical Topics index. Cited because the lateral-lisp claim is the one
    // thing on these pages that tells a parent to ACT rather than to relax, and
    // a claim in that direction has to be attributable.
    source: {
      short: 'Bowen, speech-language-therapy.com',
      full: 'Bowen, C. Lisping — when /s/ and /z/ are hard to say. '
          + 'speech-language-therapy.com.',
      url: 'https://www.speech-language-therapy.com/clinical-topics/lisping-when-s-and-z-are-hard-to-say',
      note: 'on the difference between an interdental and a lateral lisp, and why only one of them resolves on its own',
    },
  },

  sh: {
    heading: 'The half of "sh" you can actually see',
    angle: 'the half you can see, and the half you cannot',
    mouth: 'The tongue pulls back slightly from where it sits for "s", and — the part you can '
         + 'see — the lips push forward and round.',
    seen: 'partly',
    insight:
      '"sh" is made of two things happening together, and children very often get one and not '
      + 'the other. The tongue position is hidden and hard; the lip rounding is right there on '
      + 'the front of the face and easy to copy. So the common near-miss is a sound sitting '
      + 'somewhere between "s" and "sh" — the tongue still forward, the lips already correct. '
      + 'That is a child halfway there rather than a child who is missing the sound, and the '
      + 'visible half is the half you can help with.',
    tip: 'The "quiet" gesture — finger to lips, a long "shhhh". Children already know this one '
       + 'socially, which means they will produce it without it feeling like practice at all.',
    faq: [[
      'My child\'s "sh" sounds like something between "s" and "sh".',
      'That is the usual near-miss, and it is a good sign. "sh" needs the lips rounded and the '
      + 'tongue pulled back; the lips are visible and get learned first. Exaggerate the round '
      + 'lips when you say the word and the visible half takes care of itself.',
    ]],
  },

  ch: {
    heading: '"ch" is two sounds welded together',
    angle: 'two sounds welded into one',
    mouth: 'A "t" that does not fully release — instead it opens straight into "sh", in one '
         + 'movement.',
    seen: 'partly',
    insight:
      'This explains the substitution better than anything else on the page. "ch" is not a '
      + 'single gesture, it is two joined at speed: the tongue makes a "t", and instead of '
      + 'popping cleanly it slides into "sh". A child who says "tip" for "chip" has produced '
      + 'the first half correctly and stopped. They are not missing the sound; they are '
      + 'stopping halfway through it. Which is also why it arrives late — it needs two things '
      + 'the child already owns, joined with timing they do not own yet.',
    tip: 'Say "t — sh" slowly with a gap, then close the gap a bit each time until it becomes '
       + '"ch". A train pulling away makes the same accelerating pattern and is more fun.',
    faq: [[
      'My child says "tip" for "chip". Are they missing the sound completely?',
      'No — they are producing the first half of it. "ch" is a "t" that slides into "sh"; your '
      + 'child is making the "t" and stopping there. Saying "t—sh" slowly and gradually '
      + 'speeding it up joins the two halves they already have.',
    ]],
  },

  /* ---- the liquids: last and hardest ------------------------------------ */
  l: {
    heading: 'The "l" in "leaf" and the "l" in "ball" are two different jobs',
    angle: 'why "leaf" is easy and "ball" is not',
    mouth: 'The tongue tip goes up to the ridge behind the top teeth and stays there while the '
         + 'voice flows out around the SIDES of the tongue.',
    seen: 'partly',
    insight:
      'English has two versions of this sound and children get them at different times. The '
      + '"l" that starts a word — leaf, lamp — is the bright one, and it comes first. The "l" '
      + 'that ends a word — ball, school — is made further back and sounds darker, and it '
      + 'arrives noticeably later, often as "baw" in the meantime. So a child who says "leaf" '
      + 'perfectly and "baw" for "ball" is not being inconsistent or careless. They have one '
      + 'of the two jobs and not yet the other, which is precisely what you would expect.',
    tip: 'Sing "la la la" up and down a scale. Singing holds the tongue tip up for longer than '
       + 'speech does, which is the exact thing this sound needs.',
    faq: [[
      'My child says "leaf" perfectly but "baw" for "ball". Why only sometimes?',
      'Because those are two different sounds wearing one letter. The "l" at the start of a '
      + 'word is made at the front and comes first; the "l" at the end is made further back '
      + 'and arrives later. Having one and not the other is the normal order, not '
      + 'inconsistency.',
    ]],
  },

  r: {
    heading: 'Why "r" is the last sound to arrive',
    angle: 'the last sound to arrive, and why',
    mouth: 'The tongue bunches or curls in the middle of the mouth — and, uniquely, touches '
         + 'nothing at all while doing it.',
    seen: 'hidden',
    insight:
      'Two things make this the hardest sound in English and the last one to settle. First, '
      + 'there is no contact: every other consonant gives the tongue a landmark to hit, and '
      + 'this one gives it a shape to hold in mid-air, with nothing to feel for. Second, it is '
      + 'not one sound. The "r" in "red" and the r-coloured vowels in "car", "bird" and "her" '
      + 'are learned separately, which is why a child can have one and not the others and '
      + 'sound maddeningly inconsistent while doing nothing unusual at all.',
    tip: 'Do not drill this one. Before their fifth birthday there is very little to be gained '
       + 'and a fair amount of goodwill to lose. Growl like a tiger, or use "errr" as a '
       + 'thinking noise — the sound turns up in play long before it turns up on demand.',
    faq: [[
      'My four-year-old says "wabbit". Should we be practising "r" properly?',
      'Not yet, and pushing it now mostly costs enthusiasm. This is the last consonant to '
      + 'arrive, and "w" standing in for it is the documented pattern. Growling and playful '
      + '"errr" noises are the right level of effort at four.',
    ], [
      'My child can say "red" but not "bird". Is that odd?',
      'Not at all. The "r" that starts a word and the r-coloured vowels in "bird", "car" and '
      + '"her" are learned separately. Having one and not the other is ordinary, and it is why '
      + 'this sound can seem to come and go.',
    ]],
  },

  /* ---- the glide children use to replace everything else ---------------- */
  w: {
    heading: 'The sound children use to replace other sounds',
    angle: 'the stand-in for the hard sounds',
    mouth: 'Lips round into a small tight circle, then open outward as the voice runs.',
    seen: 'visible',
    insight:
      'Most pages here are about a sound a child does not have yet. This one is the opposite. '
      + '"w" arrives early and easily, and children then put it to work covering for the '
      + 'sounds that have not turned up — "wabbit" for rabbit, "weaf" for leaf. So if you are '
      + 'hearing a lot of "w", it is not a sign of a problem with "w" at all; it is a sign '
      + 'your child has found a workable stand-in for the two hardest sounds in the language '
      + 'and is getting on with talking rather than waiting. That is a good instinct.',
    tip: 'Blowing games — bubbles, a feather across the table, candles that keep relighting. '
       + 'They all start from the rounded lips this sound needs.',
    faq: [[
      'My child uses "w" for lots of other sounds. Is the "w" itself the problem?',
      'No — "w" is doing its job. It arrives early and children use it to cover for "r" and '
      + '"l", which arrive much later. Hearing a lot of "w" means your child has found a '
      + 'workable substitute and is talking anyway, which is the right instinct.',
    ]],
  },
};

/**
 * The first thing anybody reads.
 *
 * This is the most valuable real estate on the site: a parent searching at 11pm
 * should be able to stop after this one paragraph and feel better. The earlier
 * version generated it from a two-branch template, so seven pages opened with a
 * character-for-character identical sentence — the single line that most needed
 * to be about THIS child's sound was the most generic thing on the page.
 *
 * Phrasing note: use "by around" / "until around" here, never "by about <N>
 * years". test-seo.mjs treats "by about <N> years" as a claim about this sound's
 * mastery age and checks it against norms.js, and these sentences deliberately
 * mention other ages and other patterns.
 */
export const SHORT_ANSWER = {
  p: '&ldquo;p&rdquo; is one of the first sounds children get, usually by around 3 years old. '
   + 'If what you are hearing is &ldquo;big&rdquo; for &ldquo;pig&rdquo;, the lips are already '
   + 'doing the right thing — only the voice is in the wrong place.',
  b: '&ldquo;b&rdquo; is usually one of the very first sounds a child produces, in place by '
   + 'around 3 years old. Most children arrive at it without anyone ever setting out to teach it.',
  m: '&ldquo;m&rdquo; is one of the earliest sounds of all, usually there by around 3 years old. '
   + 'If it vanishes for a week, check whether your child has a cold before you consider '
   + 'anything else — this is the first sound a blocked nose takes away.',
  n: '&ldquo;n&rdquo; usually settles by around 3 years old. If it comes and goes depending on '
   + 'the week, that is almost always the nose rather than the speech.',
  h: '&ldquo;h&rdquo; is usually in place by around 3 years old. It is also the sound most often '
   + 'simply dropped rather than swapped — and in plenty of ordinary accents the adults in the '
   + 'room drop it too.',
  w: '&ldquo;w&rdquo; arrives early, usually by around 3 years old. If your child is using it in '
   + 'place of other sounds, that is a sign it is working rather than a sign it is wrong.',
  d: '&ldquo;d&rdquo; is one of the earliest sounds, usually in place by around 3 years old. '
   + 'Hearing a great deal of it is ordinary — several other sounds pass through &ldquo;d&rdquo; '
   + 'on their way in.',
  t: '&ldquo;t&rdquo; usually settles by around 3 and a half. It is also the sound children '
   + 'borrow most often to stand in for harder ones, so hearing it everywhere is expected.',
  k: '&ldquo;k&rdquo; usually arrives by around 3 and a half. &ldquo;tat&rdquo; for '
   + '&ldquo;cat&rdquo; before then is the most common and best documented swap in all of child '
   + 'speech — and there is a reason a mirror never helps with it.',
  g: '&ldquo;g&rdquo; usually arrives by around 3 and a half. &ldquo;doe&rdquo; for '
   + '&ldquo;go&rdquo; before then is expected: the back of the tongue is the last part of the '
   + 'mouth to come under a child\'s control.',
  f: '&ldquo;f&rdquo; usually settles by around 4 years old. &ldquo;pish&rdquo; for '
   + '&ldquo;fish&rdquo; is a normal way-station — the right lips, held for the wrong length of '
   + 'time.',
  l: '&ldquo;l&rdquo; is one of the later sounds. A four-year-old who says &ldquo;weaf&rdquo; for '
   + '&ldquo;leaf&rdquo; is not behind — and &ldquo;baw&rdquo; for &ldquo;ball&rdquo; lasts '
   + 'longer still, because those are two different jobs wearing one letter.',
  sh: '&ldquo;sh&rdquo; is one of the later sounds, and a four-year-old saying &ldquo;soo&rdquo; '
    + 'for &ldquo;shoe&rdquo; is on time. The rounded lips are the half you can see, which makes '
    + 'them the half you can help with.',
  ch: '&ldquo;ch&rdquo; is one of the later sounds. &ldquo;tip&rdquo; for &ldquo;chip&rdquo; at '
    + 'four is not a missing sound — it is the first half of one, produced correctly and then '
    + 'stopped.',
  s: '&ldquo;s&rdquo; is one of the later sounds, and &ldquo;tun&rdquo; for &ldquo;sun&rdquo; at '
   + 'four is on time. The one thing genuinely worth listening for is whether the sound is wet '
   + 'and slushy rather than simply off, because those two go in different directions.',
  r: '&ldquo;r&rdquo; is the last consonant to arrive in English. A four-year-old saying '
   + '&ldquo;wabbit&rdquo; is squarely on time — this one usually is not settled until around '
   + '6 years old, and pushing it early costs more goodwill than it gains.',
};

/** Mirror advice, which is genuinely different per sound and usually given wrongly. */
export const SEEN_LINE = {
  visible:
    'This one is easy to show. Sit somewhere you can both see a mirror, or just get face to '
    + 'face, and let your child watch you make it — everything that matters happens on the '
    + 'front of your face.',
  partly:
    'You can show part of this one. Some of what matters happens on the front of the face and '
    + 'some of it happens behind the teeth, so a mirror helps a little — but do not expect '
    + 'watching alone to be enough.',
  hidden:
    'You cannot show your child this one. All of it happens out of sight inside the mouth, so '
    + '"watch my mouth" is advice that cannot work here — which is worth knowing before you '
    + 'spend an evening trying.',
};
