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

/** The companions the product actually has, by the name a child would type.
 *  Null-prototype: a plain object answers KNOWN['constructor'] with a function,
 *  and every lookup here is attacker-supplied text from a URL. */
const KNOWN = Object.assign(Object.create(null), {
  butterbean: 'goldendoodle',
  marmalade: 'cat',
  rosie: 'friend',
  pip: 'toy',
});

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
/* APPENDED, NEVER REORDERED. These indices are encoded into links that have
   already been sent; inserting a colour in the middle would repaint somebody's
   grandmother in a card that is sitting in a text message. New colours go on
   the end, forever. The first blonde is index 7 for that reason and not because
   blonde is an afterthought. */
const HAIRS = ['#C68B4E', '#3B2A20', '#8C4B2A', '#2E2E33', '#6B4423', '#D9A441', '#7A5C3E',
               '#EBCF8D', '#F3E3B8', '#B5651D', '#D8D8D8'];

/* Eye colour was not offered at all and the rig was hard-wired to one blue-grey,
   so every person this generated had the same eyes. */
const EYES = ['#41627A', '#3D7EA6', '#4E7A46', '#6B4A2E', '#2E2E33', '#7A8A94'];

const KNITS = ['#8CA07B', '#7B93A0', '#A08C7B', '#9B7BA0', '#A07B84', '#7BA093',
               '#C96F5A', '#E8C87A', '#5F6B8A', '#D8D8D8'];

/* Animal coats: [fur, furDeep, ear, line]. `line` draws the nose, brows and
   mouth, so on a dark coat it must be LIGHTER than the fur or the whole face
   disappears -- which is exactly what a black cat did on the first attempt. */
const COATS = [
  ['#F0DCC0', '#DFC4A0', '#CBA57C', '#6B5648'],
  ['#EDB57E', '#D9995F', '#C07F49', '#7A5540'],
  ['#3A3A3E', '#2C2C30', '#4A4A50', '#9AA0AA'],
  ['#FAFAF7', '#E4E4DE', '#D0D0C8', '#7A7A72'],
  ['#E8C27A', '#D3A85C', '#BE9247', '#6B5230'],
  ['#9AA0A6', '#848A90', '#6F757B', '#3E4348'],
  ['#8B5E3C', '#744C2F', '#5F3D25', '#2F1E12'],
];

/* The literals each rig is built from, so a recolour is a value swap and the
   rigs stay a pure description of a character that knows nothing about being
   recoloured. Dog and cat differ because they are built from different
   palettes (COAT vs COAT_ALT in palette.js). */
/** Spoken/written names for the coats, used in the alt text and the builder. */
const COAT_WORDS = ['cream', 'ginger', 'black', 'white', 'golden', 'grey', 'brown'];

const RIG_LITERALS = {
  goldendoodle: ['#F0DCC0', '#DFC4A0', '#CBA57C', '#6B5648'],
  cat:          ['#EDB57E', '#D9995F', '#C07F49', '#7A5540'],
};

/** For matching against KNOWN, where stripping to bare latin letters is right:
 *  "Butter-bean" and "butterbean" are the same companion. */
const norm = (n) => String(n || '').trim().toLowerCase().replace(/[^a-z]/g, '');

/** For deciding whether two cast entries are the SAME PERSON, where stripping
 *  is catastrophic. norm() reduces every non-latin name to the empty string, so
 *  a card naming two Hebrew people — or two emoji, or two Japanese names — saw
 *  '' twice and silently dropped the second. Identity is the literal name,
 *  case- and whitespace-insensitive and nothing more. */
const identity = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');

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
  eye:  EYES.map((e, i) => ({ i, swatch: e })),
  knit: KNITS.map((k, i) => ({ i, swatch: k })),
  coat: COATS.map((c, i) => ({ i, swatch: c[0] })),
};

/** Which questions a species can answer. The builder reads this rather than
 *  hard-coding a branch, so a rig cannot be asked about hair it does not have. */
export const TRAITS_FOR = {
  friend: ['skin', 'hair', 'eye', 'knit'],
  goldendoodle: ['coat'],
  cat: ['coat'],
  toy: [],
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
  // A person carries four traits, an animal one. Reading them off the same
  // positions keeps the code short and the link short.
  return {
    name,
    species,
    skin: un36(t[1]),
    hair: un36(t[2]),
    knit: un36(t[3]),
    eye:  un36(t[4]),
    coat: un36(t[1]),
  };
}

/** The inverse, used by the builder to write a link. */
export function toSpec({ name, species, skin, hair, knit, eye, coat }) {
  const code = SPECIES_CODE[species];
  const n = String(name || '').trim();
  if (!code) return n;
  if (code !== 'p') return coat === null || coat === undefined ? `${n}~${code}` : `${n}~${code}${b36(coat)}`;
  return `${n}~p${b36(skin)}${b36(hair)}${b36(knit)}${b36(eye)}`;
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
    let svg = ACTORS[rig].svg;
    let label = ACTORS[rig].species;
    const lit = RIG_LITERALS[rig];
    /* An animal was never recolourable, so every cat this produced was the
       marmalade one -- a black cat was simply not expressible, and a name the
       product did not know fell through to being drawn as a PERSON. */
    if (lit && spec.coat !== null && spec.coat >= 0 && spec.coat < COATS.length) {
      const c = COATS[spec.coat];
      lit.forEach((from, i) => { svg = svg.split(from).join(c[i]); });
      label = `${COAT_WORDS[spec.coat]} ${rig === 'cat' ? 'cat' : 'dog'}`;
    }
    return { name: clean, species: label, rig, svg, spec };
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
  const eye = EYES[pick(spec.eye, EYES, 17)];

  // friendSvg() builds from four literals. Swapping them by value is blunt, but
  // it is also why this file needs no cooperation from actors.js: the rigs stay
  // a pure description of a character and know nothing about being recoloured.
  const svg = base.svg
    .split('#F0CBA8').join(skin)
    .split('#DDB08A').join(skinDeep)
    .split('#E8A88A').join(cheek)
    .split('#C68B4E').join(hair)
    .split('#8CA07B').join(knit)
    .split('#41627A').join(eye)
    /* The rig hard-codes a brow and a hair-shadow tuned to ITS ginger hair. On
       blonde they read as two different heads of hair on one person, so both
       follow whatever hair was chosen. */
    .split('#9C6B39').join(hair);

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
    const key = identity(parseSpec(n).name);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = characterFor(n);
    if (c) out.push(c);
  }
  return out;
}
