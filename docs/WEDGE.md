# The wedge

**Live:** [kide.us/clinician/](https://kide.us/clinician/) · **Test:** `npm run test:clinical` (59 assertions)

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

## What is still required

- **Show it to real SLPs.** Everything above is a hypothesis about a customer
  who has not yet been asked. The artifact exists so that conversation can be
  had with something concrete rather than a description.
- **Calibrate against labelled child speech.** The scoring thresholds behind
  these figures are measured but on adult speech (docs/BENCH.md). Every number
  on the report inherits that limitation, and the disclaimer says so.
- **Nothing here diagnoses.** Kide is practice, not therapy. The report
  describes what was practised and what happened, with the uncertainty
  attached, so a qualified human can decide.
