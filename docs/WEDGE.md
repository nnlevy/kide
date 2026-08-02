# The wedge

**Live:** [kide.us/parent/](https://kide.us/parent/) (parent) ·
[kide.us/clinician/](https://kide.us/clinician/) (the record) ·
**Tests:** `npm run test:clinical` (59) + `npm run test:journal` (82)

```
public/engine/clinical.js   the statistics
public/engine/journal.js    durable, local-only, privacy-enforced storage
public/parent/              weekly trend, car list, share, delete
public/clinician/           the artifact an SLP files
```

Spec §7 names it in one line, and it was the only named component never built:

> **The clinical PDF:** per-phoneme attempt counts, level progression, and
> adherence — the data an SLP currently cannot get, **which is the entire B2B wedge.**

## Why this and not the model, the engine, or the art

None of the other pieces compound. The acoustic model is a commodity anyone can
download. The selection policy is replicable in a week by someone who reads the
spec. The artwork is commissionable. Each is necessary; none is defensible.

The evidence layer is different on four counts:

**1. Data asymmetry that widens by itself.** A clinician sees a child for maybe
thirty minutes a fortnight. Home practice produces per-phoneme, timestamped data
every day. The gap between what the clinic knows and what the product knows
grows with every session, and cannot be bought or copied — only accumulated.

**2. The weakness *is* the moat.** Per-attempt scoring of young children's
speech is unreliable: models miss real misarticulations about three times more
often than they false-flag correct speech (spec §1). That rules out diagnosis
permanently. But the same evidence base finds aggregate severity tracks
clinicians at **ICC ≈ 0.98**. Many unreliable measurements aggregate into a
reliable trend. The property that makes this product unusable as an assessment
is exactly what makes it valuable as longitudinal evidence — and a competitor
who doesn't understand that will either overclaim (and get burned) or not build
it at all.

**3. Adherence is a question nobody can currently answer.** The incumbent in
home-programme speech therapy is a laminated printable. It goes home and no one
ever learns whether it was used. "Did they practise, and on what?" is worth
paying for on its own, before a single accuracy figure is considered. Note the
product's own retention insight points the same way: the competitor fails
because *the parent* quits around week two, not the child (docs/HABITS.md). The
number that exposes that is the number that sells.

**4. It reframes who the customer is.** The validation scorecard scored
kide.us **10/25, No-Go** — correctly, on the *consumer* angle: parent
willingness-to-pay is near zero against infinite free substitutes. The clinician
was never scored. An SLP has a budgeted, acute, recurring need for progress
documentation, and one SLP reaches forty families. That is a different business
with different unit economics, and the consumer product becomes the
data-collection mechanism rather than the thing being sold.

*This does not overturn the scorecard.* It identifies a customer the scorecard
didn't evaluate. Testing that with real clinicians is the next commercial step,
and it is cheap: the artifact now exists to show them.

## Where the evidence comes from, and how it survives

**The gem was a demo until the data persisted and the real game fed it.**
Two things were missing, and both were fatal:

**1. Evidence lived only in memory.** Close the tab and a month of history was
gone. Adherence — the number nobody else can produce — is *entirely* a function
of history, so a 28-day record that cannot survive a browser restart is not a
record. `journal.js` is now an append-only, capped, versioned local store, and
it degrades rather than fails: quota exhausted drops the oldest half, storage
unavailable falls back to memory, corrupt or future-schema data is ignored
rather than half-interpreted.

**2. The real game produced no evidence at all.** Only the scene demo did. But
`/play` has *always* asked children to say words — "red", "three", "circle" —
and the on-device recogniser has always known whether it heard them. That was
real speech practice going unrecorded. Mapping each answer word to the phoneme
target it carries (`tools/lexicon/build_play_targets.py`, validated exactly
like the main lexicon) turns the existing game into the evidence source
**without changing one thing a child sees or does**.

The distinction a clinician would check first is preserved end to end: a spoken
answer is recorded at the `native` tier and counts as speech; a tap is recorded
and counts as adherence only. An attempt the recogniser heard but could not
match is *also* recorded — leaving it out would bias the record upward by
discarding exactly the attempts that went badly.

## Privacy is enforced on write, not by convention

The journal has an **allow-list**, not a block-list, and a test asserts that a
field nobody anticipated is dropped too. `audio`, `pcm`, `waveform`,
`embedding`, `voiceprint`, names, emails and dates of birth cannot be persisted
even if a future caller passes them. An allow-list fails safe; a block-list
fails open, and this is the one place the product's defining promise is kept or
lost.

Sharing is a **link with the data in the URL** — a parent hands a clinician a
record from their own device with no account, no login, and nothing reaching a
server. `clear()` deletes everything and is reachable from the parent surface,
because a parent deleting their child's record is an obligation, not a feature.

## The correctness constraint that makes it credible

**`clinical.js` must never read the policy's beta state.** A test enforces it.

The policy's `a`/`b` counts are a **control signal**, deliberately biased for
selection: decayed at 0.92 per attempt so they track *recent* ability, and
weighting a miss at half a success because the scorer under-detects. Both are
correct for deciding what to practise next. Both are **wrong for inference** —
they systematically overstate ability and discard history.

A clinician reading a number derived from that would be reading an artefact of
our scheduling heuristic. So the evidence layer keeps its own accumulator over
raw attempt events and computes honest statistics from those.

*Separating the control signal from the inference signal is the single thing
that makes this defensible to somebody who looks closely.*

## Two exclusions that decide whether the report is honest

**A tap is not speech.** The engine records a tap as `verdict: 'clear'` because
tapping is always a valid way to play and must never be punished — but the child
said nothing. Counting taps would inflate every rate on the report, and would do
so *most* for the children who talk least. That is precisely backwards, and it
is the kind of error that would end a clinical conversation permanently. Only
attempts scored from audio count; the tap count is disclosed on the artifact.

**A forced resolution is a gift, not a measurement.** When the attempt cap fires
the scene resolves regardless of what was heard. Right for the child, meaningless
as evidence. Excluded, and disclosed.

On a tap-only device the report still gives full adherence and then says plainly
that no speech was measured — the honest split, since the child *did* practise.

## Method

| | |
|---|---|
| Interval | Jeffreys, Beta(x+½, n−x+½), **90%** |
| Why Jeffreys | Wald is badly wrong at small n and near 0% or 100% — exactly where a struggling phoneme sits, and it can return a zero-width interval at 0/n |
| Why 90% not 95% | At the sample sizes a home programme really produces, 95% is so wide it reads as "we know nothing", which is its own kind of misleading. Stated on every report |
| Minimum to report a rate | 8 attempts |
| Minimum to claim a direction | 20 attempts, **and** non-overlapping intervals, **and** ≥ 0.15 absolute change |
| Measured false-positive rate on pure noise | **3.0%** over 200 simulated coin-flip learners |

Non-overlapping intervals *alone* let noise through — measured at 2.5%. Adding a
minimum effect size was not cosmetic: the failure mode is a child discharged
early on a change that never happened. The cost of the stricter rule is missing
very small genuine changes, and the remedy for that is another month of
practice, which is the right way round.

**A fortnight is not enough**, and the worked example spans 28 days to show it.
At two weeks, even a genuine 25-point improvement fails to separate. That the
method refuses to call it is the method working — and a clinician should know
that before relying on it.

## Privacy, which is also the product promise

No audio. No voiceprints. No embedding that could re-identify a child. The
record holds phoneme-level outcomes, timestamps, and a first name only. The
amended COPPA Rule (in force since 22 April 2026) lists voiceprints as biometric
personal information; storing one would convert the product's defining promise
into its largest liability. A test asserts nothing resembling audio reaches the
record.

The report is shareable as a link with the data encoded in the URL — a parent
can hand a clinician a record without an account, a login, or the data touching
a server.

## What is actually sold, and what is not

**Live:** `/clinician` · **Tests:** `npm run test:billing` (16)

Every measurement is free, permanently. A parent hands over a link and a
clinician reads every number in it without paying, without an account, and
without anything reaching a server. Charging to see whether a child improved
would be the exact dark pattern the portfolio's monetization rules forbid, and
it would also destroy the distribution: the free record is what gets this in
front of an SLP at all.

What is sold is the **documentation wrapper** — the header identifying the
clinician, the setting, the child by *their* chart reference and the period
covered; the full method appendix; and an attestation and signature block. That
is the gap between a page a clinician can read and a document a clinician can
file, and it is worth money precisely because documentation time is the scarcest
thing an SLP has.

**One credit, one report. $39 for five, $129 for twenty-five.** The unit is a
caseload, not a document: one clinician carries about forty families, so a
per-child price is absurd and a per-seat subscription is a procurement
conversation nobody has agreed to have. At $7.80 a report it repays itself
against a billable hour if it saves fifteen minutes. Every full SLP practice-
management tool starts at $39–49 *per month*, most at $150–200 per provider, so
this sits below the threshold where anyone has to ask permission to try it.

### The paywall is deliberately the weak kind

Entitlement is checked on the server; the document is rendered in the page.
Server-rendering it would be marginally harder to bypass and would require
posting a child's phoneme history to a server — the one promise this product
cannot break. So this is a professional licence enforced by an entitlement
check, not DRM. Anyone who reads the page source can render the document
unpaid; a licensed clinician putting a document in a patient chart is not that
person, and designing for that person would cost the privacy guarantee that is
the only reason this record can exist.

Three things reach the network, and they are exhaustive: the clinician's own
email, an opaque random token this browser generated, and an offering id. No
phoneme, no count, no date, no name, nothing derived from any of them.
`test-billing.mjs` asserts it, and asserts it against the request shape rather
than the transport — the first version matched on `fetch(` and was therefore
vacuous, which mutation-testing found by leaking `record.targets` past a green
suite.

## What is still required

- **Show it to real SLPs.** Everything above is a hypothesis about a customer
  who has not yet been asked. The artifact exists so that conversation can be
  had with something concrete rather than a description — and now the
  conversation can end in a transaction rather than a thank-you.
- **Nothing routes an SLP here yet.** `/clinician` is `noindex` and always will
  be, because it renders a child's record. There is no public page that explains
  this to a clinician who has never met the product, so the only current path in
  is a parent handing over a link. That is the next revenue constraint, and it
  is a content problem, not a billing one.
- **Calibrate against labelled child speech.** The scoring thresholds behind
  these figures are measured but on adult speech (docs/BENCH.md). Every number
  on the report inherits that limitation, and the disclaimer says so.
- **Nothing here diagnoses.** Kide is practice, not therapy. The report
  describes what was practised and what happened, with the uncertainty
  attached, so a qualified human can decide.
