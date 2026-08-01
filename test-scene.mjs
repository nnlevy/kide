// test-scene.mjs -- the Actor Contract, enforced.
//
// Spec section 10 step 4: "prove the Actor Contract by dropping the cat into
// the same scene without touching scene code. If that swap isn't clean, the
// contract is wrong and it's cheap to find out now."
//
// The most valuable assertion here is the boring one: scene.js must not
// contain the word "dog". A contract that only holds by convention will leak
// the first time someone adds a wagging-tail special case.
//
// Run: node test-scene.mjs

import fs from 'node:fs';
import { ACTORS, actorList, getActor, STATES, REQUIRED_ANCHORS, MOUTHS } from './public/scene/actors.js';
import { LessonEngine } from './public/engine/engine.js';
import { keyOf } from './public/engine/lexicon.js';
import { offerChoices, createLearner } from './public/engine/policy.js';

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`); }
};
const eq = (n, a, b) => ok(n, a === b, `expected ${b}, got ${a}`);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
console.log('\n--- the scene must not know what it is rendering ---');
// ---------------------------------------------------------------------------

const sceneSrc = fs.readFileSync('./public/scene/scene.js', 'utf8');
// Strip comments -- prose explaining the rule may legitimately mention it.
const sceneCode = sceneSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const banned of ['dog', 'cat', 'puppy', 'Butterbean', 'Marmalade', 'goldendoodle']) {
  // OBJECT_ICONS legitimately maps lexicon words including animals, so only
  // flag identifiers/strings outside that map.
  const iconsStart = sceneCode.indexOf('OBJECT_ICONS');
  const before = iconsStart >= 0 ? sceneCode.slice(0, iconsStart) : sceneCode;
  ok(`scene code never references "${banned}" in logic`,
     !new RegExp(`\\b${banned}\\b`, 'i').test(before),
     'a scene that knows its actor has already broken the contract');
}
ok('scene code never references a phoneme target',
   !/\bph\b\s*[:=]|phoneme/i.test(sceneCode),
   'a scene knows it has a gap; it does not know /r/ is being practised');

// ---------------------------------------------------------------------------
console.log('--- every actor satisfies the contract ---');
// ---------------------------------------------------------------------------

ok('more than one body plan exists', actorList().length >= 2,
   'a contract with one implementation is untested');

for (const a of actorList()) {
  for (const anchor of REQUIRED_ANCHORS) {
    ok(`${a.id} exposes anchor #a-${anchor}`, a.svg.includes(`id="a-${anchor}"`));
  }
  for (const s of STATES) {
    ok(`${a.id} implements state ${s}`, !!a.poses[s], Object.keys(a.poses).join(','));
    if (a.poses[s]) {
      ok(`${a.id}.${s} uses a known mouth`, !!MOUTHS[a.poses[s].mouth], a.poses[s].mouth);
    }
  }
  ok(`${a.id} declares why it gets stuck`, typeof a.stall === 'function' && a.stall('X').includes('X'));
  ok(`${a.id} has a non-verbal sound bank`, !!a.voice && !!a.voice.wait,
     'sounds, never words -- words would compete with the VO');
}

// Stall grammar must actually DIFFER, or the second actor is a reskin and
// proves nothing about the contract.
{
  const stalls = actorList().map((a) => a.stall('N'));
  eq('every actor has a distinct stall', new Set(stalls).size, stalls.length);
}

// ---------------------------------------------------------------------------
console.log('--- WAIT is the warmest state, never impatient ---');
// ---------------------------------------------------------------------------

for (const a of actorList()) {
  ok(`${a.id} WAIT is not a still/frozen pose`, a.poses.WAIT.bob !== 'still',
     'WAIT holds indefinitely and must stay alive, not freeze');
  ok(`${a.id} WAIT smiles`, a.poses.WAIT.mouth === 'smile');
  ok(`${a.id} TRIUMPH is visibly bigger than WAIT`,
     a.poses.TRIUMPH.bob !== a.poses.WAIT.bob);
}

// ---------------------------------------------------------------------------
console.log('--- child-driven choice ---');
// ---------------------------------------------------------------------------

{
  const L = createLearner({ concern: 'unclear', rng: mulberry32(5) });
  const offer = offerChoices(L, { count: 3 });
  ok('several routes are offered', offer.choices.length >= 2,
     `${offer.choices.length} choices`);

  // The whole point: every option must serve the SAME target, so the child's
  // choice cannot derail the lesson.
  const engineTarget = keyOf(offer.target.m);
  const allSame = offer.choices.every((c) => keyOf(c.word) === engineTarget);
  ok('every offered choice practises the same sound', allSame,
     'if choices differed in target, the child could dodge their weakest sound');

  const words = new Set(offer.choices.map((c) => c.word.w));
  ok('the choices are visibly different words', words.size === offer.choices.length,
     [...words].join(','));
}
{
  // Nothing advances until the child picks -- WAIT holds.
  const e = new LessonEngine({ rng: mulberry32(6) });
  const beforeBeat = e.learner.beat;
  const o = e.offerBeat();
  eq('offering does not advance the beat', e.learner.beat, beforeBeat);
  eq('the world waits', o.state, 'WAIT');
  ok('no beat is active until the child chooses', e.current === null);

  const b = e.chooseBeat(1);
  ok('the child\'s pick starts the beat', e.current !== null);
  ok('the beat records that the child chose it', b.chosenByChild === true);
  eq('choosing the second option honours the second option', b.word.w, o.choices[1].word.w);
}
{
  // Choosing must be safe -- an out-of-range pick is a bug in the caller, and
  // must not silently start an unrelated beat.
  const e = new LessonEngine({ rng: mulberry32(7) });
  e.offerBeat({ count: 2 });
  let threw = false;
  try { e.chooseBeat(99); } catch { threw = true; }
  ok('an impossible choice is rejected, not guessed', threw);
}

// ---------------------------------------------------------------------------
console.log('--- the swap itself ---');
// ---------------------------------------------------------------------------

{
  // Simulate what Scene.setActor validates, without a DOM.
  const a = getActor('goldendoodle'), b = getActor('cat');
  ok('the two actors have genuinely different body plans',
     a.svg !== b.svg && a.species !== b.species);

  const anchorsOf = (x) => REQUIRED_ANCHORS.filter((n) => x.svg.includes(`id="a-${n}"`)).sort().join(',');
  eq('both expose an identical anchor set', anchorsOf(a), anchorsOf(b));

  const statesOf = (x) => Object.keys(x.poses).sort().join(',');
  eq('both implement an identical state set', statesOf(a), statesOf(b));

  // A body missing an anchor must fail loudly at swap time rather than pose
  // nothing and look "fine".
  const broken = { ...a, id: 'broken', svg: a.svg.replace('id="a-tail"', 'id="a-nope"') };
  const missing = REQUIRED_ANCHORS.filter((n) => !broken.svg.includes(`id="a-${n}"`));
  ok('a body missing an anchor is detectable', missing.length === 1 && missing[0] === 'tail');
}

// ---------------------------------------------------------------------------
console.log('--- no failure state is reachable through the scene ---');
// ---------------------------------------------------------------------------

{
  const stub = { score: async () => ({ verdict: 'unsure', tier: 'sim', score: null, confidence: 0.2 }) };
  const e = new LessonEngine({ scorer: stub, rng: mulberry32(8) });
  e.offerBeat(); e.chooseBeat(0);
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push(await e.submitAttempt(new Float32Array(16000)));
  ok('a child who is never heard still reaches TRIUMPH',
     seen[2].state === 'TRIUMPH', seen.map((s) => s.state).join('>'));
  ok('none of the three attempts is labelled a failure',
     seen.every((s) => s.state !== 'FAIL' && !/wrong|no|incorrect/i.test(s.say)),
     seen.map((s) => s.say).join(' | '));
  ok('the forced resolution is not banked as mastery',
     !e.log.some((r) => r.forced && r.verdict === 'clear'));
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  x ' + f);
  process.exit(1);
}
console.log('OK\n');
