# Pip's voice in *Say it with me*

## The bug this closes

The product's central accessibility claim is on the homepage: *a two-year-old
who can't read a word can still play alone.* `/words` shipped rendering every
invitation as text. For the exact child the product exists for, it was
unusable without an adult reading it out.

That is not a missing nicety. It is the core promise broken on the newest
surface, and it was invisible to every test we had, because every test could
read.

## 116 lines, not 510

An invitation is a station phrase plus a word: *"Butterbean — needs a way
across. Can you say — rope."* Recording every combination is 6 stations × 85
words = **510** takes. Recording the phrase and the word separately and playing
them in order is **116**, including all the chrome and every companion name.

The saving is not the point; the flexibility is. Adding a word to the lexicon
costs one clip instead of six.

For this to sound like speech rather than two files, the writing has to do the
work:

- every invitation **ends unfinished**, on a slight rise, so the word lands
  rather than starts;
- there are **two takes** of each — `solo` (no name in it) and `after` (written
  to follow a spoken name);
- a name is only ever spliced at the **front**. A hole in the middle of a
  sentence lands on the wrong intonation and sounds broken.

Both properties are enforced by tests, not by care.

## Three routes, and we say which one you got

| route | what it is | when |
|---|---|---|
| `recorded` | Pip's own voice, from the pack | once the pack is rendered |
| `device` | the browser's own **local** voice | today, on most devices |
| `silent` | text only | browsers with no local voice |

A **remote** synthesis voice is declined even when it is the only one offered,
because it would ship the words to a server — quietly breaking the one rule the
whole product rests on. Silence is the better failure.

The Parent Corner reports which route is actually in use on that device. A
parent told "spoken aloud" who hears nothing has been misled.

## Names are never synthesised

From the design bible: *speak the name, don't synthesise it.* Neural front-ends
mangle uncommon proper names, and a robot mispronouncing the name a child chose
thirty seconds ago is worse than not saying it.

So if we hold no recording of a name, the invitation uses the name-free take.
The name is dropped, not guessed. `nameVoice()` returns `[]` rather than
something plausible.

## The sequencing rule

**Never a timer between two lines.** The next clip starts when the previous one
has *ended*.

This is the same bug that truncated Pip in the garden games: a caption replaced
on a fixed delay while the clip was still playing, so a child heard the first
word of a sentence and nothing else. `said()` in `/words` waits on the speech
with a floor for pacing and a ceiling so a stalled clip can't freeze the game —
and a test asserts the ceiling is above the clip cap, because that exact
off-by-one shipped once already.

## Rendering the pack

```
npm run voice:words                          # write tools/voice/words-script.json
OPENAI_API_KEY=... npm run voice:words -- --render
```

The script carries its own voice direction. It is resumable — an existing mp3
is skipped — and it rewrites `index.json` from what is actually on disk, so the
player can never claim a clip that isn't there.

**The script is generated from the same module that plays the lines.** A
hand-kept manifest drifts, and the failure mode is silent: half a pack that
never plays. A test asserts every id the player can ask for exists in the
script.

## What is not done

- The pack is **not rendered**. No TTS credentials were available.
- The recorded voice should be a **person**, not a model. The script is written
  for a human reader — the direction, the unfinished endings and the name
  splice all assume one.
- `/play` still has its own separate voice pack. Two systems is one too many;
  they should converge on this one.
