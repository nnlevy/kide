# Kide: habits, routines & character — design spec

v1 · 2026-07-27 · extends [BRAND.md](./BRAND.md). Read this before adding any content that
teaches a *behavior* rather than a *fact*. The existing quiz engine (colors, counting,
shapes) is not the model for this and must not be reused for it.

---

## 1. The sink with no water

A toddler plays happily with a play sink that has no water. Nothing is being rewarded,
nothing is being scored, and the "reward" the object appears to promise never arrives.
The play continues anyway.

What the child is actually enjoying is **being the person who does the routine**. Pretend
play from roughly 18 months on is how toddlers rehearse the sequences they've watched
adults perform. The motivation is agency and imitation, not outcome. The water is
irrelevant because the water was never the point.

This is the single most useful observation available for this product, and it dictates the
mechanic: **rehearsal, not assessment.**

## 2. What a screen can and cannot do here

Colors and shapes are *knowledge* — there is a correct answer, and a quiz with adaptive
tiers is a reasonable way to build it. Potty training, honesty and empathy are not
knowledge. A three-year-old already knows pee goes in the potty. The gap is body
awareness, sequence execution, and motivation, all of which live in the bathroom and at
the dinner table, not on the tablet.

Two hard constraints follow.

**Transfer deficit.** Children under roughly three learn markedly less from a screen than
from the same demonstration in person. Contingent, responsive interaction narrows the gap
but does not close it. So the screen cannot be where the habit is acquired.

**Rewards backfire on prosocial behavior.** Warneken & Tomasello gave 20-month-olds a
material reward for helping. When the reward was withdrawn, helping fell to **53%** of
trials, against **81%** for praise and **89%** for no reward at all. Rewarding a toddler
for being kind makes them less kind. The overjustification effect is real at 20 months.

The consequence for Kide is blunt: **the streak-and-leaf system must not be extended to
habits or character content.** It works on the quiz because a right answer is a right
answer. Attached to helping, sharing or pooping, it does active harm.

So the screen's honest jobs are: **rehearse** the sequence before the real moment,
**prime** the child in the minutes leading up to it, and **script the parent**, who is the
actual delivery mechanism.

## 3. The mechanic: Pip's Turn

The child helps Pip do the routine. The child is never the trainee.

- Pip needs to go. The child walks Pip to the bathroom, pulls down Pip's pants, sits Pip
  down, waits with Pip, wipes, flushes, washes hands. Seven taps, no wrong answers.
- **No score. No streak. No stars. No timer.** Nothing is counted.
- Replayable to the point of tedium, because that is what toddlers do with a play sink and
  it is the mechanism, not a failure of design.
- Pip sometimes waits and nothing happens. That is a normal ending, not a fail state.
- In one episode Pip has an accident. Pip is not scolded. Someone helps Pip clean up and
  they try again later. This is the most important single screen in the product.
- The child is the competent one throughout. That removes performance pressure from the
  child's own body, which matters more than it sounds — see below.

The same shell generalizes to handwashing, teeth, getting dressed, and bedtime without new
mechanics.

## 4. Red lines

**No screen in the bathroom, during the act.** State this to parents as a feature. A
tablet on the potty pulls attention away from the internal signals the child is supposed
to be learning to read, and stretches sitting time past the point of usefulness. Rehearsal
happens *before*, in another room.

**Never reward or score elimination.** Roughly a quarter of children go through stool
withholding, and it carries about three times the odds of functional constipation. The
causal path runs through pressure and performance anxiety. A product that makes pooping
into a scored event is not neutral — it is a risk factor. This is also, commercially, the
most valuable segment in the category, so getting it right is both the ethical and the
profitable call.

**Escalate, don't treat.** Withholding beyond a few days, pain, blood, or soiling after
previously being trained are medical, not motivational. The parent surface flags these and
says see a pediatrician. Parents in this segment consistently report having been dismissed
by clinicians; being the thing that takes them seriously and points them correctly is
worth more than pretending to solve it.

**No accounts, no child data leaving the device.** Already true of the game. Keep it true,
and keep saying so — it is a real differentiator in a category whose best-rated app is a
diaper advertisement.

## 5. Honesty

Two things parents get wrong that the product should correct.

At two and three, most "lying" is wishful thinking and fantasy rather than deception. Real
deception arrives around three and a half to four, and its arrival is a **theory-of-mind
milestone** — evidence the child now understands that other people hold beliefs different
from their own. It is developmentally good news dressed as bad behavior.

And punishment makes it worse. Talwar & Lee found children in punitive environments lied
*more*, and lied more skillfully. The corrective is the finding on moral stories: tales
that dramatize the **positive consequences of telling the truth** (Washington and the
cherry tree) reduced lying, while tales that dramatize the **punishment for lying**
(Pinocchio, the Boy Who Cried Wolf) did not. The whole tradition of scaring children into
honesty does not work.

So: Kide's honesty content is stories in which someone tells the truth about a mess and is
**met with relief and warmth**. No consequence framing, no nose growing, no wolf. And the
line handed to the parent is: *"Thank you for telling me. That was hard to say."*

## 6. Empathy

Spontaneous helping shows up at 14 to 18 months without instruction. The job is not to
install it, it is to **avoid extinguishing it** — see the 53/81/89 numbers above.

Content is narration and modeling, not tasks: Pip notices a friend is sad, wonders why,
tries something, sometimes gets it wrong. Feelings get named out loud. Nothing is scored,
nothing is unlocked, and the child is never told they did empathy correctly.

## 7. What this is not

Not a chart. Not a sticker economy. Not a habit tracker with a streak. Not a quiz about
feelings. Not a tablet the child holds while sitting on the potty.

The competitor to beat is a laminated printable from Etsy, and it fails because the
*parent* quits around week two — not because the child disengages. Whatever gets built,
the retention problem to solve is the parent's, and the thing being sold is parental
follow-through.
