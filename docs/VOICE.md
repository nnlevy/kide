# Pip's voice

Pip speaks every question out loud, and — where it can be done without a child's
audio ever leaving the device — listens for spoken answers.

Two independent halves, deliberately. **Speaking** is on by default, needs no
permission, and works everywhere. **Listening** is off until a grown-up turns it
on, and is simply absent on devices that can't do it privately.

Everything lives in `public/voice.js` (~400 lines, zero dependencies) plus a
folder of static audio. Nothing else in the game knows how any of it works.

---

## Speaking: rendered once, not streamed

Every line the game says is deterministic — six colors, three shapes, one
counting prompt, six affirmations, four retries, a handful of screen lines.
Thirty-eight utterances, and never a sentence assembled at runtime.

So the whole voice track is rendered **once at build time** and shipped as static
MP3s, rather than calling a TTS API per play. That is the entire reason this is
affordable:

| | Streamed per play | Pre-rendered (what we do) |
|---|---|---|
| Cost at 100k sessions | recurring API spend, scales with success | **$0.0005, once** |
| Latency before Pip speaks | a network round trip, every prompt | none — it's a cached file |
| Works offline | no | yes, after the first visit |
| API key in the browser | yes, or a proxy worker to build | neither |
| Child's device talks to a vendor | on every prompt | never |

Rendered with OpenAI `gpt-4o-mini-tts`, which accepts a prose performance note.
That direction is in `tools/voice/manifest.js` and is the single biggest quality
lever here — it's the difference between a label being read aloud and a character
talking to a two-year-old:

> Speak SLOWLY, with clear separation between words, and land the final keyword
> of a sentence distinctly. Warm, soft, smiling, endlessly encouraging — never
> loud, never hurried… Think of kneeling down to a toddler's eye level.

Clips are then trimmed of leading/trailing silence, loudness-normalised to
−16 LUFS so no line is startlingly louder than another, and encoded at 48 kbps
mono. The whole pack is **624 KB** — about one photograph.

### Changing the voice or the words

```bash
cd tools/voice
# edit manifest.js — change `voice`, the `direction`, or any line's text
OPENAI_API_KEY=… node generate.js            # only re-renders what changed
OPENAI_API_KEY=… node generate.js --voice sage --force   # try a different voice
```

The generator hashes `voice + direction + text` per line, so editing one word
costs one request. Candidates worth trying: `coral` (current — warm and
characterful), `shimmer` (gentlest), `sage` (calm and low), `alloy`
(gender-neutral, which fits the brand note that Pip has no gender).

After regenerating, copy the output into `public/voice/v1/` and, if you changed
any wording, mirror it into the `TEXT` map in `public/voice.js` — that map is
what the browser-speech fallback reads if a clip ever fails to load.

**Adding a new pack version:** bump `packVersion` in the manifest and `VERSION`
in `voice.js` together. Paths are versioned (`/voice/v1/…`) precisely so the
worker can serve them `immutable` for a year with no cache-busting to think
about.

---

## Listening: on-device or not at all

The policy is one line: **if the browser cannot recognise speech without sending
a child's voice to a server, we don't offer a microphone.** There is no cloud
fallback, and no setting that enables one.

Concretely, `voice.js` requires all of:

1. `SpeechRecognition.available({ processLocally: true })` resolves to
   `available` — the browser has an on-device speech model installed;
2. a grown-up has passed the maths gate and read the consent screen;
3. `recognition.processLocally = true` **took effect** — the property is read
   back after assignment, because on a browser without on-device support the
   assignment silently does nothing and starting would ship audio to a server.

`listen()` enforces all three itself rather than trusting its caller. That
matters because this file is meant to be dropped into other sites: a host that
forgets to check must still be unable to open a cloud microphone on a child.

Today that means Chrome 139+ on desktop and Android. On an iPad, the mic simply
never appears and the game is tap-only — which is not a degraded experience, it
is the original one. It will light up automatically wherever the capability
lands next.

### Where the audio goes

Nowhere. No `MediaRecorder`, no upload, no persistence. A transcript exists as a
local variable for a few milliseconds, is compared against the two-to-four
answers currently on screen, and is discarded. This is well inside the FTC's
[2017 COPPA enforcement policy on voice recordings](https://www.ftc.gov/news-events/news/press-releases/2017/10/ftc-provides-additional-guidance-coppa-voice-recordings)
— audio used solely as a replacement for typing, held only momentarily, never
used for identification — and in fact goes further, since the audio never
reaches a server at all.

### Understanding a two-year-old

Toddlers say "lello", and recognisers hearing "lello" often emit "hello". So
`voice.js` carries a pronunciation table of the shapes recognisers actually
produce, plus bounded fuzzy matching:

- alias sets per answer (`purple` ← `purpo`, `puple`, `people`…);
- Levenshtein tolerance scaled to word length;
- a suffix rule capped at two characters, so `circley` matches but `tomato`
  never becomes `two`;
- scoring across all five recogniser alternatives, earlier ones weighted higher;
- **phrase biasing** (`SpeechRecognitionPhrase`) where available, telling the
  recogniser which three words to expect.

Two safety properties make the generous matching safe:

**Vocabulary is scoped to the question.** A transcript is only ever matched
against the options on screen, so `people` counts as `purple` only in a question
that offers purple at all.

**Ties lose.** If two options score equally, or nothing clears the threshold, it
is treated as "didn't hear that" rather than a coin flip. A wrong auto-answer
confuses a two-year-old and teaches them the wrong word; a miss just means Pip
says *"I didn't quite hear that. Try again, or tap!"*

`npm run test:voice` includes 33 pronunciation cases, roughly a third of them
negative, pinning both behaviours.

---

## Navigable without reading

The claim is that a child who can't read can play alone. That is only true if
*every* screen they meet on their own works without letters — so the garden
(choosing a game) and the goodnight invitation are voice-navigable too, not just
the questions.

- **Garden.** Pip says *"Say colors, counting, or shapes… or tap one!"* and
  listens. Saying any of the three opens it. When listening is off, the same
  screen says *"Pick a game! Colors… counting… or shapes?"* — still naming the
  options, because a pre-reader can't read the cards either way.
- **Questions.** The prompt, then the mic.
- **Goodnight.** *"I'm getting sleepy. Should we say goodnight?"* accepts a
  spoken *yes* or *no*.

Two ordering details that matter more than they look:

**The nudge comes before the question, never after.** A two-year-old who hears
*"Find something red!"* followed by three seconds of *"say the color out loud, or
tap it"* has forgotten the question by the time the mic opens. The last thing
heard is always the thing they have to answer.

**One line per screen, not two.** On the garden the nudge *is* the prompt —
playing both would mean eight seconds of Pip talking before a toddler gets a
turn. The "say it out loud" hint appears once per level, not once per question.

## The handoff

The requirement was that passing the device from grown-up to child be explicit.
It is two screens, and the split does three jobs at once.

**Screen one — the grown-up.** A card that states exactly what is switched on
right now: whether Pip speaks, whether Pip listens (or that listening isn't
available on this device), and that nothing leaves the device. One button:
*Hand it over.*

**Screen two — the child.** Pip waves and says *"Hi there! Are you ready to play
with me?"* One button: *Yes!*

The grown-up's tap ends their turn; the child's tap begins theirs. It's also the
honest place to surface mic state, because a parent should be able to see at a
glance whether a microphone is live before they walk away. And it solves a
technical problem for free: iOS only permits audio to start from inside a user
gesture, so the handoff tap *is* the audio unlock. The privacy moment and the
technical moment are the same moment, which is why it never feels like a
compliance interstitial.

Turning listening on is a separate, deliberate path: Parent Corner → maths gate →
a consent screen in plain language → the browser's own permission prompt. In that
order, so a parent has read what we do before a system dialog appears. Switching
it off erases the stored permission.

---

## Reusing this on another site

`voice.js` has no dependencies and no build step, and the three things that
differ per game — what it says, how those words get mispronounced, and where the
clips live — are injectable rather than forked:

```html
<script src="/voice.js"></script>
<script>
  KideVoice.configure({
    version: "v1",
    text:    { "prompt-animal-dog": "Find the dog!" },   // merges, doesn't replace
    aliases: { dog: ["dog", "doggy", "dawg", "og"] },
    priority: ["prompt-animal-dog"]                      // warmed on the first gesture
  });
</script>
```

Then: render a pack with `tools/voice/`, drop it at `/voice/v1/`, serve
`/voice/*` with `Cache-Control: immutable` (see `src/worker/index.ts`), call
`KideVoice.unlock()` from your handoff tap, and use `speak(id)` /
`mic.listen({ vocab, onMatch })`.

### The twin at quizbiz.org/teachthefuture

`quizbiz.org/teachthefuture` runs the same game file, differing only by nine
branding substitutions. Porting is therefore mechanical, not a merge:

```bash
tools/voice/port.sh ~/.openclaw/workspace/quizbiz
```

It refuses to run against a dirty tree, and prints the two things it can't do
for you: the `/voice/*` cache header in that site's worker, and the microphone
sections of its privacy policy and terms. **Do not skip the second** — the
privacy claims have to match what actually ships.

### API

```js
KideVoice.unlock()                  // call inside a user gesture; unlocks iOS audio
KideVoice.speak(id)                 // → Promise, resolves when the line finishes
KideVoice.stop()
KideVoice.setMuted(bool) / .muted()

KideVoice.mic.support()             // → 'available' | 'downloadable' | 'downloading' | 'unsupported'
KideVoice.mic.install()             // parent-initiated language-pack download
KideVoice.mic.permission()          // the browser's own mic prompt
KideVoice.mic.listen({ vocab, onMatch, onNoMatch, onState, onError })
KideVoice.mic.stop() / .indicator(state)

KideVoice.consent.get() / .grant(mode) / .revoke()
KideVoice.listenEnabled()           // consent AND on-device capability, both
KideVoice._match(alts, vocab)       // exposed for tests
```

`speak()` resolving on completion is what lets the caller open the mic only after
Pip has stopped talking — otherwise Pip hears himself.

---

## Tests

```bash
npx playwright install chromium   # once
npm run test:voice
```

47 assertions in a real Chromium against the built site: the handoff sequence,
that every prompt is actually spoken, that the garden can be navigated by voice,
that a spoken answer scores identically to a tap, that consent gates the
microphone, that mispronunciations still land across ten consecutive questions
including repeats, that a missing clip degrades to the browser's own voice rather
than silence — and, on a simulated device with no on-device recognition, that
there is no path through the UI *or* through the module's own API to opening a
microphone.

Two of those exist because the suite caught real bugs:

- `speakScreen` keyed its "already spoken" guard on the question's *content*.
  Colors repeat constantly in a two-option round, so roughly one question in
  three looked like a duplicate render: Pip fell silent and the microphone never
  reopened. It is keyed on a per-question serial now.
- A line cut short by a screen change still ran its follow-up, opening the
  microphone against a question that was no longer on screen while the new
  prompt played — Pip talking over himself, into his own mic. `speak()` now
  resolves `false` when superseded and every continuation checks.
