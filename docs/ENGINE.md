# The lesson engine

Spec §10 build order step 3: *"Build the lexicon and selection engine headless,
with unit tests over simulated learners. It is pure data and pure functions —
testable long before any art exists."*

**Inspect it live:** [kide.us/engine/](https://kide.us/engine/) ·
**Run the tests:** `npm run test:engine`

```
public/engine/
  lexicon.js    GENERATED join table -- 85 words x 6 affordances (build with `npm run lexicon:build`)
  policy.js     mastery model + selection policy. Pure functions.
  scoring.js    capability-tiered pronunciation scoring. The only file that touches a model.
  engine.js     orchestrator: beats, the attempt flow, the parent report.
  index.html    inspector UI (this is a dev surface, not a child surface)
tools/lexicon/
  build_lexicon.py   the lexicon's source of truth
test-engine.mjs      50 assertions incl. the 40-beat simulation
```

Nothing here touches the DOM, audio, or the network except `scoring.js`. A
scene renders what the engine decided; it never asks why.

## The join table

A scene knows nothing about phonemes. It knows it has a **gap**. Every word
carries a phoneme target, a complexity level, and the affordances it can
satisfy — the engine picks the target first, then a word carrying it, then a
scene that word can act inside. *The lesson chooses the word; the word chooses
the scene.* That ordering is what makes the pedagogy invisible.

85 words across all six target affordances (GAP · REACH · DARK · HIDDEN ·
CLOSED · CARRY), 113 word×affordance pairs, 19 distinct phoneme targets.

**The lexicon is generated, not hand-written.** `tools/lexicon/build_lexicon.py`
validates every row three ways and *excludes* anything that fails rather than
shipping it:

1. `gruut` (en-us) can phonemize the word;
2. every resulting IPA symbol exists in the acoustic model's vocab — so the GOP
   scorer can actually score it. **An unscoreable word is worse than no word**,
   because it would silently produce garbage confidence for a real child;
3. the claimed phoneme target really occurs at the claimed position, judged
   per-word so "big log" counts as word-initial /l/.

Check 3 caught five mislabelled rows on its first run, including `sheep` tagged
as *final* /ʃ/ when the sound is initial. Each row ships with `ids` — its IPA
pre-mapped to model vocab ids — so the scorer needs no lookup at runtime.

Word admission (spec §4) is also enforced by hand at authoring time: imageable
as a single object, inside a 2–7 year-old's receptive vocabulary, animatable
within at least one affordance, free of the banned palette.

## Selection policy

All eleven constants match the audited prototype exactly. Two exist *because a
simulation caught the engine failing*, and both have regression pins in the
test suite:

- **`DECAY = 0.92`** — without it, beta counts accumulate forever, old failures
  never wash out, and no promotion is ever reachable (zero promotions in 40
  beats despite real underlying improvement).
- **the asymmetric `zpdFit` falloff** — `1 − d×2.4` above the band, `1 − d×1.2`
  below. With a symmetric falloff the two weakest sounds were never selected
  once in 40 beats: a child who struggles with /r/ would open a speech app
  every day and never practice /r/.

### The pool, and why it had to exist

**This is the one real design addition beyond the spec, and it was found by
simulation, not by reasoning.**

The policy was verified against the prototype's 6 targets. The production
lexicon carries 19 — and at 19 the policy *starves the weakest sounds
outright*. An in-band target scores `zpdFit` 1.0 while a struggling one scores
0.64, and since `dueness` saturates at its cap for everything unselected, the
in-band target wins every time. Over 40 beats, a child's worst phoneme was
selected **zero times across all 25 seeds tested** — the exact failure the
asymmetric falloff was introduced to prevent, reappearing purely because the
lexicon got bigger.

So `POOL_SIZE = 6` caps how many targets are live at once, which is the size
the policy is known to behave at. Targets graduate when they've climbed the
whole ladder *and* hold above threshold, and a new one is admitted behind them
— which is what gives the full 85-word lexicon somewhere to go. This also
happens to be what clinical practice does: nobody works nineteen phonemes
simultaneously with a three-year-old.

The lesson generalises: **a constant verified at one scale is not verified at
another.** Re-run `npm run test:engine` against any change to policy.js.

### Verified behaviour, 40 simulated beats

Simulating a child genuinely weak on /r/ and /s/ — the case the product exists
for — reproduces the spec's audited shape:

| Target | Selections | p̂ | Level |
|---|---|---|---|
| /l/ initial | 8 | 0.69 | L2 |
| /s/ initial | 7 | 0.55 | L2 |
| /r/ initial | 7 | 0.11 | L2 |
| /b/ initial | 6 | 0.92 | **L3** |
| /p/ initial | 6 | 0.76 | L2 |
| /p/ medial | 6 | 0.67 | L3 |

The weakest sounds get the most practice; the strongest get promoted and
spaced. Zero consecutive target repeats and zero consecutive station repeats —
interleaving holds. 18 distinct words from 6 targets.

## Scoring: one result shape, four tiers

The iPad benchmark (`docs/BENCH.md`) proved one configuration works. `scoring.js`
generalises it to every other device **without ever weakening the promise that
makes the product worth buying.**

The rule, inherited from `voice.js` and not negotiable here either: *if a device
cannot score speech without sending a child's voice to a server, we do not open
a microphone on it.* There is no cloud tier in this file and no setting that
enables one.

| Tier | What it does | Where |
|---|---|---|
| `gop-webgpu` | phoneme-level GOP, FP16 model | **measured 117ms on iPad** |
| `gop-wasm` | same scoring, INT8 model | only if a live probe clears budget |
| `native` | on-device `SpeechRecognition`, word-level | Chrome 139+ |
| `tap` | no microphone | everywhere, always |

Two benchmark findings are encoded as *behaviour*, not as comments someone has
to remember:

1. **Precision is backend-dependent.** INT8 measured 4.9× slower than FP16 on
   WebGPU, but INT8 is the mature, fast path on WASM/CPU. So the model file is
   chosen by the negotiated backend. Getting this backwards is a 5× latency
   penalty, silently.
2. **Don't trust a backend, measure it.** WebGPU negotiating successfully told
   us nothing about whether it was *fast* — a software-rendered session in CI
   created fine and then took 14 seconds. So the WASM tier has to earn
   admission by running a real inference against the clock on the actual
   device, and demotes itself if it can't.

All four tiers return the same three-valued verdict — `clear`, `unsure`,
`no-input` — so scenes never branch on device capability. **There is no boolean
pass/fail anywhere in this system.**

## The attempt flow is the safety argument

Automated scoring of 3–7 year-old speech is unreliable: the best available
evidence has models missing real misarticulations about three times more often
than they false-flag correct speech, even fine-tuned on domain data (spec §1).
We cannot fix that, so the design refuses to depend on it:

- **No failure state, ever.** A low score produces a warm re-invite in which
  the companion models the sound — never a "wrong".
- **`MAX_ATTEMPTS = 3` resolves the scene regardless of score.** A child who
  tried three times has earned the magic; a stuck child is a churned child.
- **A forced resolution is celebrated identically** — the child must not be
  able to tell the difference — but is **deliberately not recorded as mastery**.
  Recording it would corrupt the very trend the parent report is built on.
- **Per-attempt scores are surfaced to nobody.** A test asserts the parent
  report contains no per-attempt score at all.

The product is robust exactly where the technology is weak. That alignment is
the strongest argument for the design, and it means a 5× scorer improvement
would change numbers in a report but not one thing a child experiences.

## Parent surface

The engine already holds everything the weekly report needs — no separate
analytics pipeline. It reports **movement with confidence, never a verdict**,
because aggregate severity tracks clinicians well (ICC ≈ 0.98) even where
per-phoneme judgements do not. Confidence is stated coarsely and honestly
(`too-soon` / `early` / `good`) rather than implying precision we don't have.

The car list is the three highest-dueness targets sitting below the band —
literally the words that would come up next, so *"try rope, rain, rabbit in the
car"* is a true statement about tomorrow's session rather than a generic tip.

## What this does not do yet

- **No scoring thresholds are calibrated.** `clearAbove` / `unsureBelow` in
  `scoring.js` are provisional and untested against labelled child speech. The
  design absorbs being wrong about them (an `unsure` is a warm re-invite), but
  they are guesses until measured.
- **No art, no audio, no scene rendering.** By design — this is the headless
  layer, and it is finished and testable before any of that exists.
- **L1 (isolation sounds) is absent and should stay absent.** You cannot hand a
  companion an *"mmm"* — isolation sounds have no object to become, so they
  can't satisfy an affordance. L1 is a different interaction: sound play at
  home base, built as a separate scene type rather than by bending the
  affordance model around it.
