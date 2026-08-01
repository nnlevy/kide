// palette.js -- the child surface's colour, as a single source of truth.
//
// Everything here comes from kide-us-design-bible.md. Values are duplicated
// nowhere else: actors.js, scene.js and reveal.js import from here, so a
// palette change is one edit rather than a grep.
//
// THE ABSOLUTE RULE, from the bible:
//
//   "Zero red anywhere in the child experience. There are no errors, so there
//    is nothing to colour red."
//
// This is not a preference. Red is the colour of correction, and a product
// built on the premise that a child cannot fail must not own a colour that
// says otherwise. The rule has already been broken once and caught in audit
// (the prototype's cat nose sat at hue 7 degrees), and it was broken again by
// the first cut of this scene rig -- pink cheeks at hue 347, coral buttons at
// hue 10. It is cheap to enforce mechanically and expensive to police by eye,
// so `isRedBand()` below is exported and test-scene.mjs runs it over every
// fill in the child surface.

/** Sunstone is the one thread tying the clinic to the meadow: on the parent
 *  surface it is the trustworthy primary action, on the child surface it is
 *  the colour of important physical objects -- rope, brick, setting sun. */
export const SUNSTONE = '#E17C5B';
export const SUNSTONE_INK = '#8A3F22'; // for accent-coloured TEXT; plain Sunstone fails AA on Alabaster

/** Reward light. Two named roles that were once confused for one another. */
export const BLOOM_FLASH = '#FFF4D4'; // the instant of arrival
export const BLOOM_GOLD  = '#FFB347'; // the sustained emitted light

export const TWILIGHT = '#5B6C8A';    // session winding down / exit
export const ALABASTER = '#F5F2EB';
export const DEEP_SLATE = '#2E3A3F';  // body text; never pure black

/** Butterbean is cream-apricot, per the bible -- an illustrator working from
 *  an earlier prompt drew "a warm honey-brown woodland creature", which is the
 *  wrong animal. The brand rests on him, so the coat values live here. */
export const COAT = {
  cream:      '#F0DCC0',
  creamDeep:  '#DFC4A0',
  ear:        '#CBA57C',
  nose:       '#6B5648',
  blush:      '#F0B49A', // warm apricot, deliberately clear of the red band
};

/** The marmalade cat -- a genuinely different body plan, same light. */
export const COAT_ALT = {
  cream:      '#EDB57E',
  creamDeep:  '#D9995F',
  ear:        '#C07F49',
  nose:       '#7A5540',
  blush:      '#F0B49A',
};

/** One consistent low-angle warm key light across every scene (bible), so the
 *  placeholder rig and the commissioned art are lit identically and the swap
 *  doesn't change the time of day. */
export const KEY_LIGHT = {
  warm:    '#FFE0B0',
  angleDeg: 18,          // low angle -> long soft shadows
  shadow:  'rgba(74,58,44,0.28)',
};

/** Golden-hour environment values used by the fallback backdrops. */
export const ENV = {
  skyHi: '#FBD9A5', skyLo: '#F5E7CF',
  hillFar: '#B8C4A6', hillNear: '#94A87C',
  grass: '#8BA870', grassDeep: '#6F8C58',
  wood: '#DDA76A', woodDeep: '#B9814B',
  water: '#8FA9B8', waterDeep: '#6B879B',
  duskHi: '#7C8FC9', duskLo: '#5B6C8A',
};

/**
 * Is this colour inside the forbidden red band?
 *
 * Deliberately narrower than "reddish": Sunstone itself sits at hue ~15 and is
 * the brand's own accent, so the band is hue < 12 or hue > 340 with enough
 * saturation to actually read as red. Desaturated browns and warm greys are
 * fine -- it is alarm-red that is banned, not warmth.
 *
 * @param {string} hex  '#RRGGBB'
 * @returns {{red:boolean, hue:number, sat:number}}
 */
export function isRedBand(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { red: false, hue: NaN, sat: NaN };
  const n = m[1];
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  return { red: sat > 0.28 && (hue < 12 || hue > 340), hue, sat };
}

/** Every colour the child surface is allowed to use, for the audit. */
export const CHILD_SURFACE_COLOURS = [
  SUNSTONE, BLOOM_FLASH, BLOOM_GOLD, TWILIGHT, ALABASTER, DEEP_SLATE,
  ...Object.values(COAT), ...Object.values(COAT_ALT),
  KEY_LIGHT.warm, ...Object.values(ENV),
];
