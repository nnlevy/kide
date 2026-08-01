# Scenes and the Actor Contract

Spec §10 build order step 4: *"Paint one scene through all four states, then
the rig, then prove the Actor Contract by dropping the cat into the same scene
without touching scene code. If that swap isn't clean, the contract is wrong
and it's cheap to find out now."*

**See it:** [kide.us/scene/](https://kide.us/scene/) · **Test:** `npm run test:scene` (72 assertions)

```
public/scene/
  actors.js   the contract, and the bodies implementing it. The ONLY file that knows an animal exists.
  scene.js    renders a scene, poses whatever actor it is handed. Names no actor, knows no phoneme.
  index.html  playable rig
test-scene.mjs
```

## The child is the protagonist, not the companion

**This is a deliberate departure from the spec as written, made at Nir's
direction, and it is the most important thing on this page.**

The spec's loop is: the companion gets stuck → the child supplies the word →
the companion is freed. That makes the *companion* the protagonist and the
child the assistant. It also means the engine decides where the child goes
next and the camera simply pans there.

Inverted here. The engine still chooses **which sound** is being practised —
the pedagogy stays invisible and stays correct — but the world lays out
**several things the child could go and do**, and waits. The child picks.

The trick that makes this safe: **every offered choice practises the same
phoneme target.** So the child's choice genuinely drives the world and cannot
derail the lesson. There is no wrong door. `offerChoices()` in
`public/engine/policy.js` guarantees it and a test asserts it — if the options
ever differed in target, a child could quietly avoid their weakest sound
forever, which is the exact failure the whole selection policy exists to
prevent.

This is the same mechanism that already makes Pip's Turn work: *the child is
the competent one throughout* (docs/HABITS.md). Agency is the motivator, not
the reward.

```js
const offer = engine.offerBeat({ count: 3 });   // world waits, indefinitely
// ... child touches something ...
const beat = engine.chooseBeat(i);              // THEIR choice starts the beat
```

`offerBeat()` does not advance the beat counter. Nothing happens until the
child acts.

## The Actor Contract

One state machine, many bodies. `actors.js` is the only file in the codebase
that knows a dog or a cat exists; `scene.js` receives an actor and poses it by
anchor id.

**The contract is enforced, not merely documented.** `test-scene.mjs` greps
`scene.js` for actor names and fails if one appears. A contract that holds only
by convention will leak the first time somebody adds a wagging-tail special
case — and by then the scenes are painted and it is expensive.

| Enforced | How |
|---|---|
| Scene never names an actor | source grep, comments stripped |
| Scene never names a phoneme | source grep |
| Every actor exposes all 8 anchors | per-actor assertion |
| Every actor implements all 5 states | per-actor assertion |
| Stall grammars genuinely differ | distinct-set assertion |
| Missing anchor fails loudly at swap time | `setActor` throws |

That last one matters: a body missing an anchor should crash the swap, not pose
nothing and look approximately fine.

**Two bodies, deliberately different.** The goldendoodle *can't reach, can't
cross*. The cat *climbed up and now can't get down*. That is a different stall
grammar, not a reskin — which is the only way the swap proves anything. Verified
in a headless browser: coat colour, ear geometry, tail path and stall line all
change; scene code, state machine and engine do not.

## The five states

| State | Rule |
|---|---|
| **WAIT** | Holds indefinitely and is the **warmest** state, not the most neutral. Tested: WAIT must not be a frozen pose and must smile. |
| **STUCK** | Never disappointed, in any scene, ever. |
| **ASK** | The invitation. The last thing heard is the thing to answer. |
| **MODEL** | Always clumsy and endearing, never corrective. This is what a miss looks like — there is no "wrong". |
| **TRIUMPH** | Shared *with* the child, never performed *at* them. |

Verified end-to-end: three consecutive misses reach TRIUMPH, the attempt cap
fires, and **the caption is byte-identical to a genuine success** — "Marmalade
did it! You said bell!" A child cannot tell the difference, which is the entire
point. Internally it is flagged `forced` and deliberately *not* banked as
mastery.

## A bug worth recording

The choice buttons originally rendered inside the stage, where the caption —
an absolutely-positioned overlay pinned to the stage's bottom edge — sat on top
of them and swallowed every tap. A headless click test caught it.

A child would have experienced this as *a game that ignores them*, which is
close to the worst failure this product can have. The fix is structural rather
than a z-index someone has to remember: the tappable layer now lives outside
the art layer, so it cannot recur.

## Getting real artwork in

**Delivering art is: drop WebP files into `/art/<scene>/<layer>.webp`.** No code
change, no rebuild, no engine involvement. `assets.js` probes for them and
composites whatever exists.

Missing layers fall back to the SVG rig **per layer**, so a scene can go live
one layer at a time and unfinished art can never break the product. Proven
end-to-end: `/art/gap/background.webp` is a real raster file, and the page
reports *"1/3 layers painted"* while compositing it over SVG midground and
foreground.

| | |
|---|---|
| Format | WebP, sRGB |
| Size | 2400×1200 (2× the 1200×600 logical stage) |
| Layers | `background` / `midground` / `foreground` — midground and foreground transparent |
| Light | **ONE** low-angle warm key from frame left, ~18° |
| Style | gouache grain, watercolour edge-pooling, painterly — *no vector-flat, no 3D* |
| Forbidden | **zero red anywhere**; no UI panels, no black scrims, no confetti, no neon |

Parallax is per-layer (0.15 / 0.45 / 1.0) because depth is the whole reason to
have layers; a flat composite would be simpler and would throw away exactly
what the bible asked for. The fallback and the real art share the same key
light, so swapping one for the other changes the drawing without changing the
time of day.

## Zero red — enforced, not intended

The bible is absolute: *"zero red anywhere in the child experience. There are
no errors, so there is nothing to colour red."*

**That rule has now been broken twice.** The prototype shipped a cat nose at
hue 7°, caught in audit. The first cut of this rig shipped pink cheeks at hue
347° and coral buttons at hue 10°, with none of the brand palette present at
all. Red is the colour of correction, and a product built on the premise that
a child cannot fail must not own it.

So it is mechanical now: `palette.js` is the single source of truth and
`isRedBand()` is run by the test suite over **every colour literal in the child
surface**, not just the palette constants — a hard-coded hex is exactly how it
got in last time. The band is tuned narrow enough to permit Sunstone (the
brand's own accent at hue ~15°) and wide enough to still catch coral and true
red. Both former violations are regression-pinned.

## The word reveal

The bible calls this the product's visual signature, and the sentence the whole
moment hangs on is: *"The word IS the light source, not a lit object... The
reward illuminates the world."*

So it is not a caption with a glow. The word arrives as an **additive emission
layer** that rim-lights the scene and the companion's coat. If the light were
decorative, a child would learn *"saying the word makes a pretty caption"*;
what they should learn is *"saying the word changed the world"*.

- Feathered multiply shadow at **45% core density** hugging the letterforms —
  a shadow the letters cast *into* the painting. A backing plate would be the
  easy version and would read as UI sitting on a picture, which is what this
  product must never look like.
- The word coalesces out of dust motes, holds 3500ms, then dissolves back into
  motes and drifts up.
- `reveal.js` hands the scene a `0..1` light value rather than touching actor
  anchors. If it reached into the companion directly it would need to know what
  a coat is, and the Actor Contract would leak.
- **`prefers-reduced-motion` drops the spring and the scale but still fires the
  light and the sound**, because the sound-to-symbol bond *is* the product and
  has to survive motion being switched off.

## What this is not

**This is a rig, not final art.** Flat rounded SVG in the house system
(docs/BRAND.md), built so the illustrator's real gouache drops into the same
anchors and the same six backdrop slots without touching scene or engine code.
Object choices currently render as emoji stand-ins (`OBJECT_ICONS` in
`scene.js`) so they read as things rather than words to a pre-reader —
replacing that map is a one-file change.

The point of building it now is exactly what the spec said: finding out whether
the contract holds is cheap today and expensive after the art exists. It holds.
