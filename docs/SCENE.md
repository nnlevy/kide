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

## What this is not

**This is a rig, not final art.** Flat rounded SVG in the house system
(docs/BRAND.md), built so the illustrator's real gouache drops into the same
anchors and the same six backdrop slots without touching scene or engine code.
Object choices currently render as emoji stand-ins (`OBJECT_ICONS` in
`scene.js`) so they read as things rather than words to a pre-reader —
replacing that map is a one-file change.

The point of building it now is exactly what the spec said: finding out whether
the contract holds is cheap today and expensive after the art exists. It holds.
