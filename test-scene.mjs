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
import { keyOf, LEX } from './public/engine/lexicon.js';
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
   'a scene knows it has a gap; it does not know /r/ is being practiced');

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
  ok('every offered choice practices the same sound', allSame,
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

  const statesOf = (x) => STATES.filter((st) => x.poses[st]).sort().join(',');
  eq('both implement an identical CONTRACT state set', statesOf(a), statesOf(b));
  eq('every actor implements the full contract state set',
     actorList().filter((x) => statesOf(x) === STATES.slice().sort().join(',')).length,
     actorList().length,
     'extra states (the toy\'s ASLEEP) are additive and must not be required of others');

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
console.log('--- zero red in the child surface (bible: absolute) ---');
// ---------------------------------------------------------------------------

{
  const { isRedBand, CHILD_SURFACE_COLOURS, SUNSTONE } = await import('./public/scene/palette.js');

  // The rule has been broken twice already -- the prototype's cat nose at hue
  // 7, and this rig's first cut (pink cheeks at 347, coral buttons at 10).
  // Enforcing it mechanically is the only version that stays true.
  for (const hex of CHILD_SURFACE_COLOURS) {
    const r = isRedBand(hex);
    ok(`palette colour ${hex} is outside the red band`, !r.red,
       `hue ${r.hue.toFixed(0)} sat ${r.sat.toFixed(2)}`);
  }

  // Sunstone is the brand's own accent and sits near the boundary -- the band
  // must be narrow enough to permit it, or the rule bans the brand.
  ok('Sunstone itself is permitted', !isRedBand(SUNSTONE).red,
     `hue ${isRedBand(SUNSTONE).hue.toFixed(1)}`);
  // ...and wide enough to still catch actual alarm red.
  ok('true red is caught', isRedBand('#FF0000').red);
  ok('the old coral is caught', isRedBand('#FF8A73').red, 'this shipped once');
  ok('the old pink cheek is caught', isRedBand('#FF8FA8').red, 'this shipped once');
  ok('warm browns are not false-flagged', !isRedBand('#8A5236').red);

  // And every literal colour in the rendered child surface, not just the
  // palette constants -- a hard-coded hex is exactly how this got in before.
  for (const f of ['./public/scene/actors.js', './public/scene/scene.js',
                   './public/scene/palette.js', './public/scene/reveal.js']) {
    const src = fs.readFileSync(f, 'utf8');
    const hexes = [...new Set(src.match(/#[0-9A-Fa-f]{6}\b/g) || [])];
    const reds = hexes.filter((h) => isRedBand(h).red);
    eq(`no red literal in ${f.split('/').pop()}`, reds.length, 0, reds.join(','));
  }
}

// ---------------------------------------------------------------------------
console.log('--- the artwork pipeline ---');
// ---------------------------------------------------------------------------

{
  const { LAYERS, PARALLAX, SCENE_ART, artPathFor, DELIVERY_SPEC, resolveSceneArt } =
    await import('./public/scene/assets.js');
  const { STATIONS } = await import('./public/engine/lexicon.js');

  eq('layer order is background -> midground -> foreground',
     LAYERS.join(','), 'background,midground,foreground');
  ok('parallax increases with proximity',
     PARALLAX.background < PARALLAX.midground && PARALLAX.midground < PARALLAX.foreground,
     'depth is the reason to have layers at all');

  // Every affordance the engine can select must have somewhere for art to go,
  // or a scene will be unpaintable and nobody will notice until it is live.
  for (const aff of Object.keys(STATIONS)) {
    ok(`${aff} has an art manifest entry`, !!SCENE_ART[aff]);
    ok(`${aff} has alt text`, !!(SCENE_ART[aff] && SCENE_ART[aff].alt),
       'a scene with no alt text is unreadable to a screen reader');
  }

  eq('art path convention is stable', artPathFor('GAP', 'background'), '/art/gap/background.webp');
  ok('the delivery spec forbids red', /zero red/i.test(DELIVERY_SPEC.forbidden));
  ok('the delivery spec names one key light', /one .*key/i.test(DELIVERY_SPEC.light));
  ok('the delivery spec rules out vector-flat', /no vector-flat/i.test(DELIVERY_SPEC.style));

  // Without probing (no fetch in node) every layer must resolve to null and
  // the scene must still be renderable -- art that hasn't arrived can never
  // break the product.
  const dry = await resolveSceneArt('GAP', { probe: false });
  eq('unpainted scene reports no art', dry.hasArt, false);
  ok('unpainted scene still returns every layer key',
     LAYERS.every((l) => l in dry.layers));

  // No placeholder art ships. The pipeline is proven by the manifest
  // mechanism instead: the build scans for delivered layers and writes it, so
  // dropping files in needs no code change and no hand-maintained JSON.
  ok('the build generates an art manifest', fs.existsSync('./public/art/manifest.json'),
     'run `npm run build`');
  {
    const m = JSON.parse(fs.readFileSync('./public/art/manifest.json', 'utf8'));
    ok('the manifest is valid JSON shaped by scene', typeof m === 'object' && !Array.isArray(m));
    for (const [scene, layers] of Object.entries(m)) {
      ok(`manifest scene ${scene} is a known affordance`, !!SCENE_ART[scene]);
      for (const l of Object.keys(layers)) {
        ok(`manifest layer ${scene}.${l} is a known layer`, LAYERS.includes(l));
      }
    }
  }
  ok('no placeholder raster ships', !fs.existsSync('./public/art/gap/background.webp'),
     'a machine-generated gradient standing in for gouache is a placeholder, and none ship');
}

// ---------------------------------------------------------------------------
console.log('--- the word reveal (the product visual signature) ---');
// ---------------------------------------------------------------------------

{
  const { revealDefs, revealLayerMarkup, REVEAL_HOLD_MS } = await import('./public/scene/reveal.js');
  const defs = revealDefs();
  const markup = revealLayerMarkup();

  // The bible: "The word IS the light source, not a lit object." An emission
  // filter is what makes that literal rather than decorative.
  ok('the word has an emission filter', /id="sc-word-emit"/.test(defs));
  ok('emission floods Bloom Gold', /flood-color="#FFB347"/i.test(defs));

  // "a localised feathered multiply shadow hugging the letterforms at 45% core
  // density... Not a scrim, not a plate." A rect behind the text is the wrong
  // answer and would read as UI sitting on a painting.
  ok('the shadow is a feathered filter, not a plate', /id="sc-word-shadow"/.test(defs));
  ok('shadow core density is 45%', /slope="0\.45"/.test(defs));
  ok('no solid backing plate behind the word', !/<rect[^>]*class="sc-word-bg"/.test(markup));

  ok('the word coalesces out of motes', /class="sc-motes"/.test(markup));
  ok('the hold matches the spec 3500ms', REVEAL_HOLD_MS === 3500, String(REVEAL_HOLD_MS));

  // The scene owns rim-lighting the actor, NOT the reveal -- otherwise
  // reveal.js would need to know what a coat is and the contract would leak.
  const revealSrc = fs.readFileSync('./public/scene/reveal.js', 'utf8');
  ok('the reveal never touches actor anchors directly',
     !/#a-|a-root|coat/i.test(revealSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
     'it hands the scene a number instead');
}

// ---------------------------------------------------------------------------
console.log('--- all four actors, and the toy that wakes ---');
// ---------------------------------------------------------------------------

{
  const { ASLEEP, WAKE_STYLE, MOUTHS } = await import('./public/scene/actors.js');

  // Spec section 2 lists four actors and each must earn its place.
  eq('all four actors exist', actorList().length, 4);
  const ids = actorList().map((a) => a.id).sort().join(',');
  eq('the four are the four specified', ids, 'cat,friend,goldendoodle,toy');
  for (const a of actorList()) {
    ok(`${a.id} says who it is for`, !!a.whoFor && a.whoFor.length > 10);
  }

  // The toy: "the first word does not solve a problem -- it wakes the toy up."
  const toy = getActor('toy');
  ok('exactly one actor wakes', actorList().filter((a) => a.wakes).length === 1);
  ok('the toy is the one that wakes', toy.wakes === true);
  ok('the toy implements ASLEEP', !!toy.poses[ASLEEP]);
  ok('no other actor has to implement ASLEEP',
     actorList().filter((a) => !a.wakes).every((a) => !a.poses[ASLEEP]),
     'an actor that was never asleep should not have to implement waking');
  ok('asleep is desaturated', /grayscale/.test(WAKE_STYLE.asleep));
  ok('colour floods back rather than snapping', WAKE_STYLE.transitionMs >= 800,
     `${WAKE_STYLE.transitionMs}ms`);
  ok('the sleeping mouth is a rest line, not a frown', !!MOUTHS[toy.poses[ASLEEP].mouth]);
  ok("the toy's stall is about waking, not an obstacle",
     /woken|wake|asleep|sleep/i.test(toy.stall('N')), toy.stall('N'));
}

// ---------------------------------------------------------------------------
console.log('--- object art: drawn, never emoji ---');
// ---------------------------------------------------------------------------

{
  const { objectSvg, hasObjectArt } = await import('./public/scene/objects.js');
  const words = [...new Set(LEX.map((x) => x.w))];
  const missing = words.filter((w) => !hasObjectArt(w));
  eq('every lexicon word has drawn art', missing.length, 0, missing.join(','));

  for (const w of words.slice(0, 12)) {
    const svg = objectSvg(w);
    ok(`${w} renders real SVG`, svg.startsWith('<svg') && svg.length > 180);
    ok(`${w} is labelled for screen readers`, svg.includes(`aria-label="${w}"`));
  }

  // Emoji must not come back: they render differently per platform, carry
  // someone else's colour, and ignore the scene's key light entirely.
  const src = fs.readFileSync('./public/scene/objects.js', 'utf8');
  const emoji = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  eq('no emoji remain in object art', emoji.length, 0, emoji.slice(0, 8).join(' '));
  const sceneSrcNow = fs.readFileSync('./public/scene/scene.js', 'utf8');
  const sceneEmoji = sceneSrcNow.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  eq('no emoji remain in the scene', sceneEmoji.length, 0, sceneEmoji.slice(0, 8).join(' '));
}

// ---------------------------------------------------------------------------
console.log('--- world motion ---');
// ---------------------------------------------------------------------------

{
  const { Scene } = await import('./public/scene/scene.js');
  const { PARALLAX } = await import('./public/scene/assets.js');
  for (const m of ['setCamera', 'panTo', 'setTimeOfDay', 'setAsleep', 'reveal', 'rimLight']) {
    ok(`Scene implements ${m}`, typeof Scene.prototype[m] === 'function');
  }
  // Parallax must actually differ per layer or the layering is decorative.
  const vals = Object.values(PARALLAX);
  eq('parallax strengths are distinct', new Set(vals).size, vals.length);
}

// ---------------------------------------------------------------------------
console.log('--- duplicate DOM ids (audit defect 2, reintroduced once already) ---');
// ---------------------------------------------------------------------------

{
  const { portraitSvg } = await import('./public/scene/actors.js');

  // The rig carries ids because the scene poses by id. Anywhere an actor is
  // drawn OUTSIDE the stage -- a chooser, a card, a print sheet -- the ids MUST
  // be stripped, or an unscoped document.querySelector('#a-root') silently
  // addresses the wrong element. The prototype's companion picker shipped this
  // exact defect (spec section 9, defect 2) and /words reintroduced it.
  for (const a of actorList()) {
    const p = portraitSvg(a);
    eq(`portraitSvg(${a.id}) carries no ids`, (p.match(/\sid="a-/g) || []).length, 0);
    ok(`portraitSvg(${a.id}) still draws the body`, p.includes('<path') && p.length > 400,
       'stripping ids must not strip the artwork');
    ok(`${a.id}'s stage rig still HAS ids`, a.svg.includes('id="a-root"'),
       'the scene poses by id -- only copies are stripped');
  }

  // And no surface may inject a raw rig into a repeated element.
  for (const f of ['./public/words/index.html', './public/scene/index.html']) {
    const src = fs.readFileSync(f, 'utf8');
    const name = f.split('/').slice(-2)[0];
    // `.svg` used inside a list/map render is the shape of the bug.
    const rawInMap = /\.map\([^)]*\)[\s\S]{0,400}?\$\{\s*\w+\.svg\s*\}/.test(src);
    ok(`${name} never injects a raw rig into a repeated element`, !rawInMap,
       'use portraitSvg() for anything drawn more than once');
  }
}

// ---------------------------------------------------------------------------
console.log('--- the naming flow ---');
// ---------------------------------------------------------------------------

{
  const { NAME_BANK, namesFor, nameAsTarget, nameIsScoreable, CUSTOM_NAME_POLICY, targetExistsInLexicon }
    = await import('./public/scene/naming.js');
  const vocab = JSON.parse(fs.readFileSync('./public/bench/data/vocab.json', 'utf8'));

  ok('the name bank is non-trivial', NAME_BANK.length >= 8);
  for (const n of NAME_BANK) {
    ok(`${n.name} is scoreable with the shipped model`, nameIsScoreable(n, vocab),
       'a name we cannot score must not be the first target -- the first attempt has to be a win');
    ok(`${n.name} maps to a target the lexicon already carries`, targetExistsInLexicon(n.target),
       `${n.target} -- otherwise the name is an orphan outside the ladder`);
  }
  for (const a of actorList()) {
    ok(`${a.id} is offered names`, namesFor(a.id, 4).length === 4);
    eq(`${a.id}'s own name is offered first`, namesFor(a.id, 4)[0].for, a.id);
  }

  // The name becomes a real lexicon-shaped target so it scores through exactly
  // the same path as any other word -- no second code path to keep correct.
  const t = nameAsTarget(NAME_BANK[0], vocab);
  ok('a name becomes a lexicon-shaped entry',
     !!t.w && !!t.ph && !!t.pos && Array.isArray(t.ids) && t.ids.length === t.ipa.length);
  ok('the name is flagged as a name', t.isName === true);

  ok('custom names are never synthesised', CUSTOM_NAME_POLICY.neverSynthesise === true,
     'a robot mispronouncing a child\'s chosen name back at them is worse than not saying it');
  ok('custom names require a parent recording', CUSTOM_NAME_POLICY.requiresParentRecording === true);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cast.js -- names to characters on the share card.
// ---------------------------------------------------------------------------
{
  const { characterFor, castFrom } = await import('./public/scene/cast.js');

  // A name the product knows is that character, not a lookalike.
  eq('Butterbean is the goldendoodle', characterFor('Butterbean').rig, 'goldendoodle');
  eq('Marmalade is the cat', characterFor('Marmalade').rig, 'cat');
  eq('Pip is the toy', characterFor('Pip').rig, 'toy');
  eq('case and spacing do not matter', characterFor('  bUtTeRbEaN ').rig, 'goldendoodle');

  // Everyone else is a PERSON. Hashing an arbitrary name onto a random species
  // would eventually render somebody's grandmother as a cat, so the species is
  // fixed and only the appearance varies.
  eq('an unknown name is drawn as a person', characterFor('Kaleigh').rig, 'friend');
  eq('and so is any other', characterFor('Grandma').rig, 'friend');

  // The same name must give the same character forever, or a card regenerated
  // next year stops matching the card that was sent.
  eq('the same name always makes the same character',
     characterFor('Kaleigh').svg, characterFor('kaleigh').svg);
  ok('two different names look different',
     characterFor('Kaleigh').svg !== characterFor('Nir').svg);

  // A card with two adults on it has to show two visibly different adults.
  const people = ['Kaleigh', 'Nir', 'Grandma', 'Sam', 'Ari', 'Jo'].map((n) => characterFor(n).svg);
  ok('six names give at least four distinguishable people', new Set(people).size >= 4);


  // parseInt(undefined, 36) returns 86464843759093, because "undefined" is a
  // valid base-36 string. An absent trait therefore read as a huge integer
  // rather than null, every "was this specified?" check downstream read true,
  // and the contrast rule below silently never ran.
  eq('an absent trait parses as null, not as "undefined" in base 36',
     characterFor('Kaleigh~p3').spec.hair, null);
  eq('a partial trait code keeps the traits it does carry',
     characterFor('Kaleigh~p3').spec.skin, 3);
  eq('a bare species code leaves the rest unset',
     characterFor('Kaleigh~p').spec.knit, null);

  // A DEFAULT MUST ALWAYS BE LEGIBLE. Dark hair defaulted onto dark skin renders
  // at shipping size as a bald head -- a bug that looks like a style choice.
  {
    const SK = ['#F0CBA8', '#E8B48C', '#C68642', '#8D5524', '#5C3317', '#FADCBC'];
    // Mirrors HAIRS in cast.js, including the appended blondes -- a stale copy
    // here silently made the contrast check read an undefined colour.
    const HA = ['#C68B4E', '#3B2A20', '#8C4B2A', '#2E2E33', '#6B4423', '#D9A441', '#7A5C3E',
                '#EBCF8D', '#F3E3B8', '#B5651D', '#D8D8D8'];
    const lum = (hex) => {
      const v = parseInt(hex.slice(1), 16);
      const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
        .map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    let worst = 1;
    for (const nm of ['Kaleigh', 'Nir', 'Grandma', 'Sam', 'Ari', 'Jo', 'Bea', 'Tom', 'Zed', 'Mia']) {
      for (let si = 0; si < SK.length; si++) {
        const c = characterFor(`${nm}~p${si.toString(36)}`);
        const hair = HA.filter((h) => c.svg.includes(h))[0];
        worst = Math.min(worst, Math.abs(lum(hair) - lum(SK[si])));
      }
    }
    ok(`no default hair vanishes into any skin (worst delta ${worst.toFixed(3)})`, worst >= 0.06);
  }

  // ...but an explicit choice is the user's business, including a deliberate
  // dark-on-dark one.
  ok('an explicitly chosen low-contrast hair is left alone',
     characterFor('Kaleigh~p33').svg.includes('#2E2E33'));


  // ---- the three characters this had to be able to express -----------------
  const { toSpec, TRAITS_FOR } = await import('./public/scene/cast.js');

  {
    const K = characterFor(toSpec({ name: 'Kaleigh', species: 'friend',
                                    skin: 0, hair: 7, knit: 1, eye: 1 }));
    eq('Kaleigh is a person', K.rig, 'friend');
    ok('Kaleigh can be blonde', K.svg.includes('#EBCF8D'));
    ok('Kaleigh can have blue eyes', K.svg.includes('#3D7EA6'));
    ok('the hard-wired blue-grey eye is gone once one is chosen',
       !K.svg.includes('#41627A'));
    // The rig hard-codes a brow tuned to ITS ginger hair; on blonde that read
    // as two heads of hair on one person.
    ok('the brow follows the chosen hair', !K.svg.includes('#9C6B39'));
    ok('Kaleigh is smiling', /M102 88 q-8 8 -14 2/.test(K.svg));

    // A cat that is not the marmalade one was previously INEXPRESSIBLE, and a
    // name the product did not know fell through to being drawn as a person.
    const C = characterFor(toSpec({ name: 'Chatulah', species: 'cat', coat: 2 }));
    eq('Chatulah is a cat, not a person', C.rig, 'cat');
    eq('Chatulah is black', C.species, 'black cat');
    ok('no marmalade left on a black cat', !C.svg.includes('#EDB57E'));
    // On a dark coat the nose/brow/mouth line must be LIGHTER than the fur or
    // the entire face disappears.
    ok('a black cat still has a face', C.svg.includes('#9AA0AA'));

    eq('Butterbean is the goldendoodle', characterFor('Butterbean').rig, 'goldendoodle');
  }

  // ---- the form is adaptive because the RIG says so ------------------------
  {
    const page = fs.readFileSync('public/make/index.html', 'utf8');
    eq('a person has four appearance traits', TRAITS_FOR.friend.join(','), 'skin,hair,eye,knit');
    eq('a dog has one', TRAITS_FOR.goldendoodle.join(','), 'coat');
    eq('a cat has one', TRAITS_FOR.cat.join(','), 'coat');
    eq('a soft toy has none', TRAITS_FOR.toy.length, 0);
    ok('a dog cannot be asked about hair', !TRAITS_FOR.goldendoodle.includes('hair'));
    ok('a person cannot be asked about fur', !TRAITS_FOR.friend.includes('coat'));

    // The screens must be GENERATED from that table. The previous version
    // hard-coded `kind === 'person'` on four screens and then needed a special
    // case in advance() to skip them -- a branch pretending to be a table.
    ok('the appearance screens are generated from the rig',
       /TRAIT_ORDER\.map/.test(page) && /draftTraits\(\)\.includes\(key\)/.test(page));
    ok('no appearance screen hard-codes a species',
       !/when: \(\) => state\.draft\.kind === 'person',\s*\n\s*body: \(\) => swatches/.test(page));
    // An index into a list whose length changes with the answers means choosing
    // "a dog" moves you to a different question than the one you were on.
    ok('the flow tracks its position by id, not index',
       /state\.stepId/.test(page) && !/state\.step\s*[+-]=/.test(page));
    ok('advance() has no per-species special case',
       !/goTo\('more'\); return;/.test(page));
  }


  // ---- adversarial input ---------------------------------------------------
  // Everything here reaches characterFor() from a URL somebody else can write.
  {
    const { parseSpec } = await import('./public/scene/cast.js');

    for (const [label, v] of [['empty', ''], ['whitespace', '   '],
                              ['null', null], ['undefined', undefined]]) {
      eq(`${label} name yields no character`, characterFor(v), null);
    }
    for (const n of ['123', '!!!', 'J', 'a'.repeat(200)]) {
      ok(`"${n.slice(0, 12)}" renders rather than throwing`, !!characterFor(n));
    }

    // KNOWN is looked up with attacker-supplied text. A plain object answers
    // KNOWN['constructor'] with a function.
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      eq(`a person called "${k}" is drawn as a person`, characterFor(k).rig, 'friend');
    }

    // norm() strips to bare latin, which is right for matching Butterbean and
    // catastrophic for identity: every non-latin name reduced to '' and a card
    // naming two Hebrew people silently dropped the second.
    eq('two Hebrew names both survive', castFrom('חתולה,אליה').length, 2);
    eq('two Japanese names both survive', castFrom('さくら,ひかり').length, 2);
    eq('two emoji names both survive', castFrom('🐱,🐶').length, 2);
    eq('the same name twice is still one', castFrom('Kaleigh,kaleigh ').length, 1);
    eq('same name, different traits, still one', castFrom('K~p1,K~p2').length, 1);

    // Malformed trait codes must degrade, never throw.
    eq('an unknown species letter falls back to a person', characterFor('X~z1').rig, 'friend');
    ok('an out-of-range index does not throw', !!characterFor('X~p999999'));
    ok('non-base36 trait chars do not throw', !!characterFor('X~p!!!'));
    eq('a bare tilde is just a name', characterFor('X~').rig, 'friend');
    eq('a tilde with no name is nothing', characterFor('~p1'), null);
    eq('only the first tilde counts', parseSpec('A~p1~c2').name, 'A');
    eq('a cat with a nonsense coat is still a cat', characterFor('C~c99').rig, 'cat');
    eq('trait codes are case-insensitive', characterFor('C~C2').rig, 'cat');
    eq('an empty cast is empty', castFrom('').length, 0);
    eq('a cast of commas is empty', castFrom(',,,').length, 0);
  }

  // ---- the builder's own rules --------------------------------------------
  {
    const page = fs.readFileSync('public/make/index.html', 'utf8');
    const worker = fs.readFileSync('src/worker/index.ts', 'utf8');
    ok('the builder escapes a name before innerHTML',
       /const esc = \(v\)/.test(page) && /esc\(c\.name\)/.test(page));
    ok('the card escapes a name before innerHTML', /esc\(c\.name\)/.test(worker));
    // commitDraft caps at three, so offering a fourth meant filling in four
    // screens and watching the result vanish.
    ok('a fourth character is never offered', /state\.cast\.length \+ 1 < 3/.test(page));
    // Skipping the species question for a known name meant a family whose own
    // cat is called Pip got the soft toy, permanently.
    ok('the species question is always asked', !/when: \(\) => !isKnownName/.test(page));
    ok('a known name pre-selects its rig instead', /seedKindFromName/.test(page));
  }

  eq('the cast is capped at three', castFrom('a,b,c,d,e').length, 3);
  eq('a name repeated is only drawn once', castFrom('Kaleigh,kaleigh,Nir').length, 2);
  eq('empty entries are dropped', castFrom('Kaleigh,,  ,Nir').length, 2);
  eq('nothing in, nothing out', castFrom('').length, 0);
  eq('a blank name has no character', characterFor('   '), null);

  // The card renders these inline with no request of any kind.
  const src = fs.readFileSync('public/scene/cast.js', 'utf8');
  ok('cast.js fetches nothing',
     !/fetch\(|XMLHttpRequest|sendBeacon|new Image|import\(/.test(src));
}

console.log('--- the share card cast ---');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  x ' + f);
  process.exit(1);
}
console.log('OK\n');
