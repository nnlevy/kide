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

/**
 * @param {string} name
 * @returns {{name:string, species:string, rig:string, svg:string}|null}
 */
export function characterFor(name) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  const known = KNOWN[norm(clean)];
  if (known && ACTORS[known]) {
    return { name: clean, species: ACTORS[known].species, rig: known, svg: ACTORS[known].svg };
  }

  // Everyone else is a person, recoloured from their own name.
  const base = ACTORS.friend;
  if (!base) return null;
  const h = hash(norm(clean) || clean);
  const [skin, skinDeep, cheek] = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >>> 5) % HAIRS.length];
  const knit = KNITS[(h >>> 11) % KNITS.length];

  // friendSvg() builds from four literals. Swapping them by value is blunt, but
  // it is also why this file needs no cooperation from actors.js: the rigs stay
  // a pure description of a character and know nothing about being recoloured.
  const svg = base.svg
    .split('#F0CBA8').join(skin)
    .split('#DDB08A').join(skinDeep)
    .split('#E8A88A').join(cheek)
    .split('#C68B4E').join(hair)
    .split('#8CA07B').join(knit);

  return { name: clean, species: 'a friend', rig: 'friend', svg };
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
    const key = norm(n);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = characterFor(n);
    if (c) out.push(c);
  }
  return out;
}
