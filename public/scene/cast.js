// cast.js -- turning a list of names into a small cast of characters.
//
// WHAT THIS IS FOR. The share card (/gift) opens on somebody else's phone, very
// often with the child already looking at it, and until now it showed a picture
// and some text addressed to their parent. A card that puts the people it names
// on the screen -- the child's companion, the aunt who sent it -- is a card a
// two-year-old will reach out and touch, which is the only interaction that
// matters on that page.
//
// WHY IT REUSES actors.js RATHER THAN DRAWING ANYTHING NEW. The four rigs in
// actors.js are the characters this product actually contains. Inventing a
// second, card-only art style would mean the first thing a family sees is not
// the thing they then get, and it would drift the moment either side changed.
//
// THE ONE DESIGN RULE. A name is mapped to a SPECIES deterministically but not
// randomly: a name the product already knows (Butterbean, Marmalade, Rosie,
// Pip) gets that exact rig, and every other name is drawn as a person. Hashing
// an arbitrary name onto a random species would sooner or later render somebody
// 's grandmother as a cat. What the hash varies is appearance -- skin, hair,
// clothes -- so "Kaleigh" is always the same Kaleigh on every card ever made,
// and two different names are very unlikely to collide.

import { ACTORS } from './actors.js';

/** The companions the product actually has, by the name a child would type. */
const KNOWN = {
  butterbean: 'goldendoodle',
  marmalade: 'cat',
  rosie: 'friend',
  pip: 'toy',
};

/** FNV-1a. Small, stable across engines, and -- the property that matters here
 *  -- identical for the same string forever, so a card regenerated next year
 *  looks like the card that was sent. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* Deliberately warm, mid-tone and non-exhaustive. These are not a claim to
   represent anybody accurately -- they are enough variation that a card with
   two adults on it shows two visibly different adults, which is the whole job.
   Ordered so adjacent hashes give clearly different results. */
const SKINS = [
  ['#F0CBA8', '#DDB08A', '#E8A88A'],
  ['#E8B48C', '#D19A70', '#DE9B7C'],
  ['#C68642', '#A96C33', '#B87050'],
  ['#8D5524', '#71421B', '#8A4B33'],
  ['#5C3317', '#452409', '#6B3A24'],
  ['#FADCBC', '#E6C3A0', '#F0B49A'],
];
const HAIRS = ['#C68B4E', '#3B2A20', '#8C4B2A', '#2E2E33', '#6B4423', '#D9A441', '#7A5C3E'];
const KNITS = ['#8CA07B', '#7B93A0', '#A08C7B', '#9B7BA0', '#A07B84', '#7BA093'];

const norm = (n) => String(n || '').trim().toLowerCase().replace(/[^a-z]/g, '');

/* Relative luminance, sRGB. Used for one job only: stopping the generator from
   handing somebody a character whose hair is invisible against their skin.
   Picking a dark-brown default hair for dark-brown skin renders, at the size
   this actually ships at, as a bald head — which is not a style, it is a bug
   that looks like a choice. */
function luminance(hex) {
  const v = parseInt(hex.slice(1), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    .map((c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const CONTRAST_FLOOR = 0.06;

/* The palettes, exported so the builder at /make can show a parent the actual
   swatches rather than an abstract "option 3". The builder and the renderer
   must read the same arrays or the preview stops predicting the card. */
export const OPTIONS = {
  skin: SKINS.map((s, i) => ({ i, swatch: s[0] })),
  hair: HAIRS.map((h, i) => ({ i, swatch: h })),
  knit: KNITS.map((k, i) => ({ i, swatch: k })),
};

/** Species codes, short because they ride in a URL a parent might read aloud. */
export const SPECIES = { p: 'friend', d: 'goldendoodle', c: 'cat', t: 'toy' };
const SPECIES_CODE = { friend: 'p', goldendoodle: 'd', cat: 'c', toy: 't' };

const b36 = (n) => Number(n || 0).toString(36)[0];
const un36 = (ch) => {
  /* The guard is not defensive padding, it is the whole function.
     parseInt(undefined, 36) coerces to the STRING "undefined" — which is a
     perfectly valid base-36 number — and returns 86464843759093. So a trait
     that was simply absent came back as a huge integer instead of null, every
     "was this specified?" check downstream read true, and the contrast nudge
     that depends on knowing a value was NOT chosen silently never ran. */
  if (typeof ch !== 'string' || ch === '') return null;
  const n = parseInt(ch, 36);
  return Number.isFinite(n) ? n : null;
};

/**
 * Traits ride in the name itself: "Kaleigh~p204".
 *
 * WHY IN THE URL AND NOT A SERVER RECORD. The card is a link somebody texts.
 * There is no account on this domain and nothing about a family is stored, so
 * the only place a choice can live is the link that carries it — which also
 * means a parent can edit one by hand, and a card still works years later with
 * nothing running behind it.
 */
export function parseSpec(raw) {
  const [namePart, traitPart = ''] = String(raw || '').split('~');
  const name = namePart.trim();
  const t = traitPart.trim().toLowerCase();
  const species = SPECIES[t[0]] || null;
  return {
    name,
    species,
    skin: un36(t[1]),
    hair: un36(t[2]),
    knit: un36(t[3]),
  };
}

/** The inverse, used by the builder to write a link. */
export function toSpec({ name, species, skin, hair, knit }) {
  const code = SPECIES_CODE[species];
  if (!code) return String(name || '').trim();
  if (code !== 'p') return `${String(name).trim()}~${code}`;
  return `${String(name).trim()}~p${b36(skin)}${b36(hair)}${b36(knit)}`;
}

/**
 * @param {string} name
 * @returns {{name:string, species:string, rig:string, svg:string}|null}
 */
export function characterFor(name) {
  const spec = parseSpec(name);
  const clean = spec.name;
  if (!clean) return null;

  /* THE HASH IS A STARTING POINT, NOT A VERDICT. Every trait it picks can be
     overridden explicitly, and an explicit choice always wins. A generator that
     could not be corrected would be worse than no generator: the first thing a
     parent does is look for the version that matches the actual person. */
  const rig = spec.species || KNOWN[norm(clean)];
  if (rig && rig !== 'friend' && ACTORS[rig]) {
    return { name: clean, species: ACTORS[rig].species, rig, svg: ACTORS[rig].svg, spec };
  }

  // Everyone else is a person, recoloured from their own name unless told.
  const base = ACTORS.friend;
  if (!base) return null;
  const h = hash(norm(clean) || clean);
  const pick = (given, arr, shift) =>
    (given !== null && given >= 0 && given < arr.length) ? given : ((h >>> shift) % arr.length);
  const [skin, skinDeep, cheek] = SKINS[pick(spec.skin, SKINS, 0)];

  /* A DEFAULT MUST ALWAYS BE LEGIBLE; AN EXPLICIT CHOICE IS THE USER'S BUSINESS.
     So only the hash-derived hair is nudged away from the skin it would vanish
     into — walking the list until something separates. If a parent deliberately
     picks hair that matches the skin, that is honoured untouched. */
  let hairIdx = pick(spec.hair, HAIRS, 5);
  if (spec.hair === null) {
    const skinL = luminance(skin);
    for (let n = 0; n < HAIRS.length; n++) {
      const cand = (hairIdx + n) % HAIRS.length;
      if (Math.abs(luminance(HAIRS[cand]) - skinL) >= CONTRAST_FLOOR) { hairIdx = cand; break; }
    }
  }
  const hair = HAIRS[hairIdx];
  const knit = KNITS[pick(spec.knit, KNITS, 11)];

  // friendSvg() builds from four literals. Swapping them by value is blunt, but
  // it is also why this file needs no cooperation from actors.js: the rigs stay
  // a pure description of a character and know nothing about being recoloured.
  const svg = base.svg
    .split('#F0CBA8').join(skin)
    .split('#DDB08A').join(skinDeep)
    .split('#E8A88A').join(cheek)
    .split('#C68B4E').join(hair)
    .split('#8CA07B').join(knit);

  return { name: clean, species: 'a friend', rig: 'friend', svg, spec };
}

/** Parse a cast list off a URL and resolve it. Capped, because three characters
 *  is a scene and six is a crowd on a phone. */
export function castFrom(list, max = 3) {
  const names = (Array.isArray(list) ? list : String(list || '').split(','))
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, max);
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const key = norm(parseSpec(n).name);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = characterFor(n);
    if (c) out.push(c);
  }
  return out;
}
