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

export const STATES = ['WAIT', 'STUCK', 'ASK', 'MODEL', 'TRIUMPH'];

/** Every actor exposes these anchors. The scene poses them by id and never
 *  looks inside. Adding a body plan means filling these in, nothing else. */
export const REQUIRED_ANCHORS = ['body', 'head', 'eyeL', 'eyeR', 'mouth', 'tail', 'earL', 'earR'];

const palette = {
  dog:  { coat: '#E8C79A', coatDeep: '#D4AE7C', ear: '#C9975F', nose: '#5B4A3F' },
  cat:  { coat: '#F2A65A', coatDeep: '#DE8C40', ear: '#C9743A', nose: '#8A5236' },
};

/** Shared drawing helper -- keeps the two rigs visually consistent so the
 *  swap demonstrates the contract rather than a change of art direction. */
function bodySvg(p, opts = {}) {
  const { earShape, tailPath, cheekOpacity = 0.5 } = opts;
  return `
  <g id="a-root">
    <ellipse id="a-shadow" cx="100" cy="171" rx="41" ry="7" fill="#000" opacity=".15"/>
    <g id="a-bob">
      <path id="a-tail" d="${tailPath}" stroke="${p.coatDeep}" stroke-width="11"
            fill="none" stroke-linecap="round"/>
      <ellipse id="a-body" cx="100" cy="128" rx="43" ry="38" fill="${p.coat}"/>
      <ellipse cx="100" cy="139" rx="27" ry="24" fill="#fff" opacity=".35"/>
      <g id="a-head">
        <path id="a-earL" d="${earShape.l}" fill="${p.ear}"/>
        <path id="a-earR" d="${earShape.r}" fill="${p.ear}"/>
        <circle id="a-skull" cx="100" cy="74" r="37" fill="${p.coat}"/>
        <ellipse cx="100" cy="88" rx="22" ry="17" fill="#fff" opacity=".45"/>
        <ellipse id="a-cheekL" cx="72" cy="86" rx="9" ry="6" fill="#FF8FA8" opacity="${cheekOpacity}"/>
        <ellipse id="a-cheekR" cx="128" cy="86" rx="9" ry="6" fill="#FF8FA8" opacity="${cheekOpacity}"/>
        <g id="a-eyeL"><circle cx="86" cy="68" r="7.5" fill="#fff"/><circle id="a-pupilL" cx="87" cy="69" r="4.4" fill="#2E3A3F"/></g>
        <g id="a-eyeR"><circle cx="114" cy="68" r="7.5" fill="#fff"/><circle id="a-pupilR" cx="115" cy="69" r="4.4" fill="#2E3A3F"/></g>
        <ellipse id="a-nose" cx="100" cy="84" rx="7" ry="5.5" fill="${p.nose}"/>
        <path id="a-mouth" d="M100 90 q-9 9 -16 3 M100 90 q9 9 16 3"
              stroke="${p.nose}" stroke-width="3" fill="none" stroke-linecap="round"/>
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
    svg: bodySvg(palette.dog, {
      earShape: {
        l: 'M70 52 q-19 4 -21 27 q-2 20 13 24 q10 2 13 -14 z',
        r: 'M130 52 q19 4 21 27 q2 20 -13 24 q-10 2 -13 -14 z',
      },
      tailPath: 'M139 132 q26 -6 24 -30',
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
    svg: bodySvg(palette.cat, {
      earShape: {
        l: 'M72 48 L62 20 L92 38 z',
        r: 'M128 48 L138 20 L108 38 z',
      },
      tailPath: 'M141 130 q30 -2 22 -34',
      cheekOpacity: 0.42,
    }),
    poses: {
      WAIT:    { bob: 'gentle', tail: 'M141 130 q30 -2 22 -34',  head: 'rotate(0 100 74)',  mouth: 'smile' },
      STUCK:   { bob: 'still',  tail: 'M141 132 q26 8 12 26',    head: 'rotate(8 100 74)',  mouth: 'open' },
      ASK:     { bob: 'gentle', tail: 'M141 128 q32 -6 26 -34',  head: 'rotate(-4 100 74)', mouth: 'smile' },
      MODEL:   { bob: 'wobble', tail: 'M141 130 q28 2 24 -18',   head: 'rotate(3 100 74)',  mouth: 'open' },
      TRIUMPH: { bob: 'bounce', tail: 'M141 124 q34 -14 18 -38', head: 'rotate(0 100 74)',  mouth: 'grin' },
    },
  },
};

export const MOUTHS = {
  smile: 'M100 90 q-9 9 -16 3 M100 90 q9 9 16 3',
  open:  'M100 88 q-8 12 -14 4 M100 88 q8 12 14 4 M86 92 q14 9 28 0',
  grin:  'M100 88 q-13 14 -20 2 M100 88 q13 14 20 2',
};

export const actorList = () => Object.values(ACTORS);
export const getActor = (id) => ACTORS[id] || ACTORS.goldendoodle;
