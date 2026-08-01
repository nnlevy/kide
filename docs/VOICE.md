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
npm run voice:words          # write the script (tools/voice/words-script.json)
npm run voice:words:render   # render it -- reads the key from ~/.openclaw/credentials
npm run test:voice-pack      # measure what nobody will listen for
```

**Rendered with ElevenLabs, not OpenAI**, and the reason is the splice.
ElevenLabs takes `previous_text` and `next_text` — context the model conditions
its prosody on but does not speak. So an invitation is rendered *knowing* a
word follows it, and keeps its rise; a word is rendered *knowing* it completes
a question, and lands rather than starts. That is exactly the hard part of
splicing, handed to the API. OpenAI's TTS takes a style instruction but has no
cross-clip continuity, so every clip would be voiced in ignorance of its
neighbours.

Settings are identical for every clip and stability is high. 116 clips
recombine in roughly 500 orders; a voice that performs each line beautifully
but *differently* would betray the splice instantly.

The pack records the voice and model that produced it. Two tools write
`index.json`, and the id-list refresh used to erase that stamp — which meant
the deployed pack carried no record of what was in it, and "which voice was
this rendered with" is the first question when a clip sounds wrong.

### Resuming is fingerprinted, not file-based

Each clip stores a hash of the voice, model, settings, text and prosodic
context that produced it. Change any of them and exactly the affected clips
re-render.

This is not tidiness. Resuming on "the file exists" left the pack half at one
speaking rate and half at another when a re-render was interrupted — invisible
on disk, obvious the moment a child hears it.

## The pace was wrong, and measured

The first render came out at **5.5 syllables/sec**. That is adult-directed
speech: a stranger talking over a child's head, and a flat failure of the brand
direction. Adults speaking to toddlers slow to roughly 3–4 syll/sec.

Fixed at the source (`speed: 0.85`) rather than by post-processing, which
degrades the audio. Now **4.10 syll/sec**.

The unit matters. The first threshold was in *words* per second, which flatters
lines like "Can you say" where every word is one syllable — and it failed by
0.02. Moving a threshold to make a test pass is a failure mode this project has
already had once, so the unit was corrected and the band taken from the
child-directed speech literature instead.

## What the pack tests measure

Nobody will listen to 116 clips before a deploy, so:

- **the join** — trailing silence on a phrase plus leading silence on a word is
  a hole in the middle of a sentence. Budget: 250ms.
- **the pace** — both bounds. Rushing talks over a child; dragging is
  patronising and loses them just as fast.
- **the manifest** — the index may never claim a clip that is not on disk, or a
  child hears silence mid-sentence.
- **the weight** — 1.7 MB for 116 clips, under a 3 MB budget.

## What is not done

- The voice is a good model, not a person. The script is written for a human
  reader — the direction, the unfinished endings and the name splice all assume
  one — and a real actor is the version worth paying for.
- Only the names in the bank are recorded. A child who wants a name we do not
  hold gets the name-free take, which is correct but plainer.
- `/play` still has a separate voice pack. Two systems is one too many; they
  should converge on this one.
