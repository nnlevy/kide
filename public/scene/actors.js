// actors.js -- the Actor Contract, and the bodies that implement it.
//
// One state machine, many bodies. This file is the ONLY place a specific
// animal exists; scene.js must never name one. That separation is the whole
// point of spec section 2, and the test in test-scene.mjs enforces it: if the
// scene ever mentions a dog, the contract has already leaked.
//
// WHAT MUST NEVER VARY, enforced at review and by the states below:
//   * never disappointed, in any state, in any scene, ever
//   * never impatient -- WAIT holds indefinitely and is the WARMEST state,
//     not the most neutral
//   * MODEL is always clumsy and endearing, never corrective
//   * TRIUMPH is shared WITH the child, never performed AT them
//
// WHAT VARIES: the body plan, why this actor gets stuck, and its non-verbal
// sound bank. Each earns its place by being a genuinely different stall
// grammar rather than a reskin.
//
// These are RIGS, not final art -- flat rounded SVG in the house system
// (docs/BRAND.md), built so the illustrator's real artwork drops into the same
// anchors without touching a line of scene or engine code.

import { COAT, COAT_ALT, KEY_LIGHT, SUNSTONE, ENV, TWILIGHT } from './palette.js';

export const STATES = ['WAIT', 'STUCK', 'ASK', 'MODEL', 'TRIUMPH'];

/** ASLEEP is a sixth state, and only the toy implements it.
 *
 *  Spec section 2 calls the toy "the best idea in this framework", and this is
 *  why: for the toy, the first word does not solve a problem -- it WAKES THE
 *  TOY UP. It sits desaturated and slumped, eyes closed, until the child
 *  speaks. Then colour floods back.
 *
 *  That is the product's entire thesis made literal: nothing happens until
 *  they speak. For a two-year-old who has been corrected into silence,
 *  watching their own voice bring something to life is a stronger motivator
 *  than any reward mechanic we could design -- and it costs one shader and one
 *  pose.
 *
 *  Kept OUT of STATES so every other actor stays exempt: an actor that has
 *  never been asleep should not have to implement waking. `wakes` on the actor
 *  declares participation. */
export const ASLEEP = 'ASLEEP';

/** Every actor exposes these anchors. The scene poses them by id and never
 *  looks inside. Adding a body plan means filling these in, nothing else. */
export const REQUIRED_ANCHORS = ['body', 'head', 'eyeL', 'eyeR', 'mouth', 'tail', 'earL', 'earR'];

// Colour comes from palette.js only. The first cut of this file hard-coded
// its own hexes and shipped pink cheeks at hue 347 -- inside the red band the
// bible forbids outright. Importing removes the opportunity.
const palette = { primary: COAT, alt: COAT_ALT };

/** Shared drawing helper -- keeps the two rigs visually consistent so the
 *  swap demonstrates the contract rather than a change of art direction. */
/** The body, built to the bible's description rather than to convenience:
 *  "heavy-bottomed pear silhouette with the weight low to the ground, stout
 *  legs, dense coat of soft rounded tufts (never individual hairs), drop ears
 *  held at a 45-degree angle, expressive brows, plumed tail."
 *
 *  Tufts are drawn as overlapping rounded bumps along the silhouette -- the
 *  cheap version is a smooth ellipse, which reads as a balloon and loses the
 *  one texture cue that says "coat". Shadow is long and offset to match the
 *  single low-angle key light every scene shares. */
function bodySvg(p, opts = {}) {
  const { earShape, tailPath, browTilt = 0 } = opts;
  const tuft = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.cream}"/>`;
  return `
  <g id="a-root">
    <ellipse id="a-shadow" cx="112" cy="178" rx="52" ry="8"
             fill="${KEY_LIGHT.shadow}" opacity=".55"/>
    <g id="a-bob">
      <path id="a-tail" d="${tailPath}" stroke="${p.creamDeep}" stroke-width="13"
            fill="none" stroke-linecap="round"/>
      <!-- stout legs, weight low -->
      <rect x="72" y="139" width="19" height="32" rx="9" fill="${p.creamDeep}"/>
      <rect x="110" y="139" width="19" height="32" rx="9" fill="${p.creamDeep}"/>
      <!-- pear body: wide and heavy at the base -->
      <path id="a-body" d="M100 88 q-44 6 -44 52 q0 32 44 32 q44 0 44 -32 q0 -46 -44 -52 z" fill="${p.cream}"/>
      ${tuft(62, 132, 13)}${tuft(70, 152, 12)}${tuft(92, 162, 13)}
      ${tuft(114, 162, 13)}${tuft(134, 150, 12)}${tuft(140, 130, 12)}
      <ellipse cx="100" cy="142" rx="26" ry="21" fill="#fff" opacity=".28"/>
      <g id="a-head">
        <path id="a-earL" d="${earShape.l}" fill="${p.ear}"/>
        <path id="a-earR" d="${earShape.r}" fill="${p.ear}"/>
        <circle id="a-skull" cx="100" cy="72" r="38" fill="${p.cream}"/>
        ${tuft(70, 56, 12)}${tuft(130, 56, 12)}${tuft(100, 38, 13)}
        <ellipse cx="100" cy="87" rx="23" ry="17" fill="#fff" opacity=".38"/>
        <ellipse id="a-cheekL" cx="70" cy="86" rx="9" ry="6" fill="${p.blush}" opacity=".55"/>
        <ellipse id="a-cheekR" cx="130" cy="86" rx="9" ry="6" fill="${p.blush}" opacity=".55"/>
        <!-- expressive brows: the whole face reads from these -->
        <path id="a-browL" d="M78 55 q8 ${-4 + browTilt} 16 -1" stroke="${p.nose}" stroke-width="2.6"
              fill="none" stroke-linecap="round" opacity=".75"/>
        <path id="a-browR" d="M106 54 q8 ${-1 - browTilt} 16 1" stroke="${p.nose}" stroke-width="2.6"
              fill="none" stroke-linecap="round" opacity=".75"/>
        <g id="a-eyeL"><circle cx="86" cy="68" r="8" fill="#fff"/><circle id="a-pupilL" cx="87" cy="69" r="4.6" fill="#3A2E26"/><circle cx="89" cy="66.5" r="1.7" fill="#fff"/></g>
        <g id="a-eyeR"><circle cx="114" cy="68" r="8" fill="#fff"/><circle id="a-pupilR" cx="115" cy="69" r="4.6" fill="#3A2E26"/><circle cx="117" cy="66.5" r="1.7" fill="#fff"/></g>
        <ellipse id="a-nose" cx="100" cy="84" rx="7.5" ry="5.8" fill="${p.nose}"/>
        <path id="a-mouth" d="M100 90 q-9 9 -16 3 M100 90 q9 9 16 3"
              stroke="${p.nose}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </g>`;
}

/** A friend, not an animal. For children who don't respond to animals, and for
 *  socially-motivated children -- a genuinely different audience rather than a
 *  palette swap, which is the bar every actor has to clear. */
function friendSvg() {
  const skin = '#F0CBA8', skinDeep = '#DDB08A', hair = '#C68B4E', knit = '#8CA07B';
  return `
  <g id="a-root">
    <ellipse id="a-shadow" cx="112" cy="178" rx="50" ry="8" fill="${KEY_LIGHT.shadow}" opacity=".55"/>
    <g id="a-bob">
      <path id="a-tail" d="M138 120 q22 10 18 34" stroke="${knit}" stroke-width="15"
            fill="none" stroke-linecap="round"/>
      <rect x="80" y="146" width="18" height="28" rx="8" fill="#6E7F60"/>
      <rect x="106" y="146" width="18" height="28" rx="8" fill="#6E7F60"/>
      <path id="a-body" d="M102 92 q-34 6 -34 40 q0 22 34 22 q34 0 34 -22 q0 -34 -34 -40 z" fill="${knit}"/>
      <path d="M74 118 q28 -8 56 0" stroke="#7A8D69" stroke-width="3" fill="none" opacity=".6"/>
      <path d="M74 130 q28 -8 56 0" stroke="#7A8D69" stroke-width="3" fill="none" opacity=".6"/>
      <g id="a-head">
        <path id="a-earL" d="M72 74 q-7 0 -7 8 q0 8 8 7 z" fill="${skinDeep}"/>
        <path id="a-earR" d="M132 74 q7 0 7 8 q0 8 -8 7 z" fill="${skinDeep}"/>
        <circle id="a-skull" cx="102" cy="70" r="34" fill="${skin}"/>
        <path d="M102 34 q-36 2 -34 40 q10 -20 34 -18 q24 -2 34 18 q2 -38 -34 -40 z" fill="${hair}"/>
        <path d="M70 74 q-6 22 6 32 q-2 -18 -6 -32z" fill="${hair}"/>
        <ellipse id="a-cheekL" cx="80" cy="82" rx="8" ry="5" fill="#E8A88A" opacity=".5"/>
        <ellipse id="a-cheekR" cx="124" cy="82" rx="8" ry="5" fill="#E8A88A" opacity=".5"/>
        <path id="a-browL" d="M86 58 q7 -3 13 0" stroke="#9C6B39" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <path id="a-browR" d="M105 58 q7 -3 13 0" stroke="#9C6B39" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <g id="a-eyeL"><ellipse cx="91" cy="68" rx="6.5" ry="7" fill="#fff"/><circle id="a-pupilL" cx="92" cy="69" r="3.8" fill="#41627A"/><circle cx="94" cy="67" r="1.5" fill="#fff"/></g>
        <g id="a-eyeR"><ellipse cx="113" cy="68" rx="6.5" ry="7" fill="#fff"/><circle id="a-pupilR" cx="114" cy="69" r="3.8" fill="#41627A"/><circle cx="116" cy="67" r="1.5" fill="#fff"/></g>
        <ellipse id="a-nose" cx="102" cy="80" rx="3" ry="2.4" fill="${skinDeep}"/>
        <path id="a-mouth" d="M102 88 q-8 8 -14 2 M102 88 q8 8 14 2"
              stroke="#A9694C" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </g>`;
}

/** The toy. Sits asleep and colourless until the child's first word. */
function toySvg() {
  const felt = '#C9A9CF', feltDeep = '#B08FB8', patch = SUNSTONE;
  return `
  <g id="a-root">
    <ellipse id="a-shadow" cx="112" cy="178" rx="48" ry="8" fill="${KEY_LIGHT.shadow}" opacity=".5"/>
    <g id="a-bob">
      <path id="a-tail" d="M140 132 q24 4 20 28" stroke="${feltDeep}" stroke-width="12"
            fill="none" stroke-linecap="round"/>
      <rect x="78" y="146" width="20" height="28" rx="9" fill="${feltDeep}"/>
      <rect x="108" y="146" width="20" height="28" rx="9" fill="${feltDeep}"/>
      <path id="a-body" d="M102 92 q-36 6 -36 42 q0 24 36 24 q36 0 36 -24 q0 -36 -36 -42 z" fill="${felt}"/>
      <path d="M86 128 q16 -6 32 0" stroke="${patch}" stroke-width="3" fill="none" stroke-dasharray="4 5" opacity=".8"/>
      <path d="M92 140 h20 v14 h-20 z" fill="${patch}" opacity=".55"/>
      <g id="a-head">
        <path id="a-earL" d="M74 46 q-14 -14 -6 -22 q10 -6 20 10 z" fill="${feltDeep}"/>
        <path id="a-earR" d="M130 46 q14 -14 6 -22 q-10 -6 -20 10 z" fill="${feltDeep}"/>
        <circle id="a-skull" cx="102" cy="70" r="36" fill="${felt}"/>
        <path d="M102 34 v72" stroke="${feltDeep}" stroke-width="2" opacity=".35" stroke-dasharray="4 6"/>
        <ellipse id="a-cheekL" cx="76" cy="82" rx="9" ry="6" fill="${patch}" opacity=".4"/>
        <ellipse id="a-cheekR" cx="128" cy="82" rx="9" ry="6" fill="${patch}" opacity=".4"/>
        <path id="a-browL" d="M82 54 q8 -3 15 0" stroke="${feltDeep}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>
        <path id="a-browR" d="M107 54 q8 -3 15 0" stroke="${feltDeep}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>
        <g id="a-eyeL"><circle cx="88" cy="68" r="7.5" fill="#fff"/><circle id="a-pupilL" cx="89" cy="69" r="4.4" fill="#3A2E3E"/><circle cx="91" cy="66.5" r="1.6" fill="#fff"/></g>
        <g id="a-eyeR"><circle cx="116" cy="68" r="7.5" fill="#fff"/><circle id="a-pupilR" cx="117" cy="69" r="4.4" fill="#3A2E3E"/><circle cx="119" cy="66.5" r="1.6" fill="#fff"/></g>
        <ellipse id="a-nose" cx="102" cy="82" rx="7" ry="5.4" fill="${feltDeep}"/>
        <path id="a-mouth" d="M102 90 q-9 8 -15 2 M102 90 q9 8 15 2"
              stroke="${feltDeep}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </g>`;
}

export const ACTORS = {
  goldendoodle: {
    id: 'goldendoodle',
    defaultName: 'Butterbean',
    species: 'a fluffy dog',
    // Why THIS actor gets stuck. The default: can't reach, can't cross.
    stall: (n) => `${n} can't quite reach it.`,
    // Non-verbal sound bank -- never words, so it never competes with the VO.
    voice: { wait: 'soft panting', stuck: 'a little whine', triumph: 'happy pant' },
    whoFor: 'The default. A name a two-year-old can say.',
    svg: bodySvg(palette.primary, {
      earShape: {
        l: 'M68 48 q-26 10 -28 42 q-1 24 16 27 q12 2 14 -18 q2 -30 -2 -51 z',
        r: 'M132 48 q26 10 28 42 q1 24 -16 27 q-12 2 -14 -18 q-2 -30 2 -51 z',
      },
      tailPath: 'M143 128 q30 -8 26 -36',
      browTilt: 0,
    }),
    // Per-state pose deltas. The scene applies these blindly.
    poses: {
      WAIT:    { bob: 'gentle', tail: 'M139 132 q26 -6 24 -30', head: 'rotate(0 100 74)', mouth: 'smile' },
      STUCK:   { bob: 'still',  tail: 'M139 134 q22 4 18 22',   head: 'rotate(-7 100 74)', mouth: 'open' },
      ASK:     { bob: 'gentle', tail: 'M139 130 q28 -8 22 -32', head: 'rotate(4 100 74)',  mouth: 'smile' },
      MODEL:   { bob: 'wobble', tail: 'M139 132 q24 0 24 -20',  head: 'rotate(-3 100 74)', mouth: 'open' },
      TRIUMPH: { bob: 'bounce', tail: 'M139 126 q30 -12 20 -36', head: 'rotate(0 100 74)', mouth: 'grin' },
    },
  },

  cat: {
    id: 'cat',
    defaultName: 'Marmalade',
    species: 'a marmalade cat',
    // A genuinely different stall grammar, not a reskin: this one climbs UP
    // and then can't get down. That changes which scenes read naturally, which
    // is exactly what the contract has to survive.
    stall: (n) => `${n} climbed up and now can't get down.`,
    voice: { wait: 'a low purr', stuck: 'a small mew', triumph: 'a chirrup' },
    whoFor: 'Cat households; a different stall grammar.',
    svg: bodySvg(palette.alt, {
      earShape: {
        l: 'M72 48 L62 20 L92 38 z',
        r: 'M128 48 L138 20 L108 38 z',
      },
      tailPath: 'M145 126 q32 -4 24 -38',
      browTilt: 3,
    }),
    poses: {
      WAIT:    { bob: 'gentle', tail: 'M141 130 q30 -2 22 -34',  head: 'rotate(0 100 74)',  mouth: 'smile' },
      STUCK:   { bob: 'still',  tail: 'M141 132 q26 8 12 26',    head: 'rotate(8 100 74)',  mouth: 'open' },
      ASK:     { bob: 'gentle', tail: 'M141 128 q32 -6 26 -34',  head: 'rotate(-4 100 74)', mouth: 'smile' },
      MODEL:   { bob: 'wobble', tail: 'M141 130 q28 2 24 -18',   head: 'rotate(3 100 74)',  mouth: 'open' },
      TRIUMPH: { bob: 'bounce', tail: 'M141 124 q34 -14 18 -38', head: 'rotate(0 100 74)',  mouth: 'grin' },
    },
  },

  friend: {
    id: 'friend',
    defaultName: 'Rosie',
    species: 'a friend',
    stall: (n) => `${n} can't get across on her own.`,
    voice: { wait: 'humming', stuck: 'a small hmm', triumph: 'a delighted laugh' },
    whoFor: "Children who don't respond to animals; socially-motivated kids.",
    svg: friendSvg(),
    poses: {
      WAIT:    { bob: 'gentle', tail: 'M138 120 q22 10 18 34',  head: 'rotate(0 102 70)',  mouth: 'smile' },
      STUCK:   { bob: 'still',  tail: 'M138 124 q20 14 10 30',  head: 'rotate(-6 102 70)', mouth: 'open' },
      ASK:     { bob: 'gentle', tail: 'M138 118 q24 8 20 32',   head: 'rotate(5 102 70)',  mouth: 'smile' },
      MODEL:   { bob: 'wobble', tail: 'M138 120 q22 12 16 30',  head: 'rotate(-3 102 70)', mouth: 'open' },
      TRIUMPH: { bob: 'bounce', tail: 'M138 112 q28 4 26 30',   head: 'rotate(0 102 70)',  mouth: 'grin' },
    },
  },

  toy: {
    id: 'toy',
    defaultName: 'Pip',
    species: 'a soft toy',
    // The toy's stall is not an obstacle in the world. It hasn't woken up yet.
    stall: (n) => `${n} hasn't woken up yet.`,
    voice: { wait: 'quiet', stuck: 'silence', triumph: 'a soft creak of stuffing' },
    whoFor: 'The strongest statement of the thesis: nothing happens until they speak.',
    /** This actor starts ASLEEP and is woken by the first word, not by a tap. */
    wakes: true,
    svg: toySvg(),
    poses: {
      // Slumped, eyes closed, colourless -- see WAKE_STYLE below.
      ASLEEP:  { bob: 'still',  tail: 'M140 138 q18 10 8 26',   head: 'rotate(14 102 70)', mouth: 'rest' },
      WAIT:    { bob: 'gentle', tail: 'M140 132 q24 4 20 28',   head: 'rotate(0 102 70)',  mouth: 'smile' },
      STUCK:   { bob: 'still',  tail: 'M140 134 q20 10 12 24',  head: 'rotate(-6 102 70)', mouth: 'open' },
      ASK:     { bob: 'gentle', tail: 'M140 130 q26 2 22 30',   head: 'rotate(4 102 70)',  mouth: 'smile' },
      MODEL:   { bob: 'wobble', tail: 'M140 132 q22 8 18 26',   head: 'rotate(-3 102 70)', mouth: 'open' },
      TRIUMPH: { bob: 'bounce', tail: 'M140 124 q30 -6 22 26',  head: 'rotate(0 102 70)',  mouth: 'grin' },
    },
  },
};

/** How a sleeping actor looks, and how waking is animated.
 *
 *  Desaturation plus a slight dim, transitioned over 1.4s so colour visibly
 *  FLOODS back rather than snapping. The scene applies this to the actor root;
 *  no other actor is affected, and nothing about the scene changes. */
export const WAKE_STYLE = {
  asleep: 'grayscale(1) brightness(0.86)',
  awake: 'none',
  transitionMs: 1400,
};

export const MOUTHS = {
  smile: 'M100 90 q-9 9 -16 3 M100 90 q9 9 16 3',
  open:  'M100 88 q-8 12 -14 4 M100 88 q8 12 14 4 M86 92 q14 9 28 0',
  grin:  'M100 88 q-13 14 -20 2 M100 88 q13 14 20 2',
  // Asleep: a soft closed line. Not a frown -- the toy is resting, not sad.
  rest:  'M92 92 q10 4 20 0',
};

/** Eyes closed, for the sleeping toy. Applied by the scene to the eye anchors,
 *  so no actor needs a second set of eye artwork. */
export const CLOSED_EYES = 'M0 0 m-8 0 q8 6 16 0';

export const actorList = () => Object.values(ACTORS);
export const getActor = (id) => ACTORS[id] || ACTORS.goldendoodle;
