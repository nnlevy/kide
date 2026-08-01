// assets.js -- how commissioned artwork gets into the product.
//
// The design bible specifies layered environments, not flat pictures:
//
//   1. Background  -- soft-focus mountains, golden sky
//   2. Midground   -- rushing stream
//   3. Foreground  -- the wooden bridge with its missing centre plank
//   4. Actor       -- the companion, on top
//
// ...lit by "a single consistent low-angle warm key light across every scene,
// casting long soft shadows for depth in the layered WebP environments."
//
// So the renderer consumes LAYERS, and this file is the seam between the code
// and the illustrator. Delivering art means dropping WebP files into
// /art/<scene>/ and adding a manifest row. No code changes, no rebuild of the
// scene, no engine involvement. If a layer is missing, the painterly SVG
// fallback renders in its place -- so the product is never broken by art that
// hasn't arrived, and scenes can go live one layer at a time.
//
// Parallax offsets are per-layer because depth is the reason to have layers at
// all; a flat composite would be simpler and would throw away exactly what the
// bible asked for.

export const LAYERS = ['background', 'midground', 'foreground'];

/** Per-layer parallax strength. Background barely moves, foreground moves
 *  most -- the standard depth cue, and it also gives the camera pan between
 *  stations something to do (spec section 6). */
export const PARALLAX = { background: 0.15, midground: 0.45, foreground: 1.0 };

/**
 * The manifest an illustrator's delivery populates.
 *
 * `art` is null until real artwork exists for that scene; the loader then
 * falls back to the SVG rig. Fill in a path and it takes over immediately.
 * Keeping every scene listed -- even unpainted ones -- makes the production
 * gap visible rather than implicit.
 *
 * Expected delivery per scene, from the bible:
 *   - WebP, sRGB, 2400x1200 (2x the 1200x600 logical stage)
 *   - transparent background on midground/foreground
 *   - lit by ONE low-angle warm key from frame left, ~18 degrees
 *   - gouache grain baked in; no vector-flat shading, no 3D
 */
export const SCENE_ART = {
  GAP:    { title: 'the broken bridge', art: null, alt: 'A forest stream at golden hour. A small wooden bridge is broken in the middle.' },
  REACH:  { title: 'the tall tree',     art: null, alt: 'A tall tree with something out of reach in its branches.' },
  DARK:   { title: 'the dark hollow',   art: null, alt: 'A dark hollow under a mossy bank, calm and inviting, never frightening.' },
  HIDDEN: { title: 'the little hill',   art: null, alt: 'A small grassy hill with someone hiding behind it.' },
  CLOSED: { title: 'the door',          art: null, alt: 'A wooden door in a garden wall, with no handle.' },
  CARRY:  { title: 'the heavy stone',   art: null, alt: 'A large smooth stone, too heavy to lift.' },
};

/** Where a scene's layers live once painted, by convention. Making this a
 *  function rather than hand-written paths means the illustrator only has to
 *  match a folder layout, not a JSON schema. */
export const artPathFor = (sceneId, layer, ext = 'webp') =>
  `/art/${sceneId.toLowerCase()}/${layer}.${ext}`;

/** The delivered-art manifest, generated at build time by
 *  tools/art/build-manifest.mjs (runs inside `npm run build`).
 *
 *  This replaced per-layer HEAD probing. Probing was genuinely drop-in, but it
 *  fired three requests per scene -- eighteen console 404s a session before any
 *  art exists -- which is noise a real deployment should not carry. Dropping
 *  WebP files into public/art/<scene>/ and deploying normally still needs no
 *  extra step from anyone, because the build regenerates this.
 *
 *  Fetched once, cached, and a missing manifest simply means no art yet. */
let _manifest = null;
async function loadManifest() {
  if (_manifest) return _manifest;
  try {
    const res = await fetch('/art/manifest.json');
    _manifest = res.ok ? await res.json() : {};
  } catch {
    _manifest = {};
  }
  return _manifest;
}

/**
 * Resolve which layers are available for a scene.
 *
 * @returns {{sceneId, hasArt:boolean, layers:{[k:string]:string|null}, alt:string}}
 */
export async function resolveSceneArt(sceneId, { probe = true } = {}) {
  const entry = SCENE_ART[sceneId] || {};
  const layers = {};
  let hasAny = false;

  // An explicit manifest entry wins over probing -- it lets art live anywhere
  // (a CDN, R2, a versioned folder) without touching this file's conventions.
  if (entry.art) {
    for (const l of LAYERS) {
      layers[l] = entry.art[l] || null;
      if (layers[l]) hasAny = true;
    }
    return { sceneId, hasArt: hasAny, layers, alt: entry.alt || '' };
  }

  if (probe) {
    const m = await loadManifest();
    const got = m[sceneId] || {};
    for (const l of LAYERS) { layers[l] = got[l] || null; if (layers[l]) hasAny = true; }
  } else {
    for (const l of LAYERS) layers[l] = null;
  }

  return { sceneId, hasArt: hasAny, layers, alt: entry.alt || '' };
}

/** Whether ANY scene has commissioned art yet. Lets a surface say "authored
 *  SVG" honestly instead of implying paint that does not exist. */
export function anyArtDelivered(resolvedList) {
  return resolvedList.some((r) => r && r.hasArt);
}

/** Preload so a scene change never shows a half-painted world. Resolves even
 *  on failure -- a missing image must not stall the game. */
export function preloadArt(resolved) {
  const urls = Object.values(resolved.layers || {}).filter(Boolean);
  return Promise.all(urls.map((u) => new Promise((done) => {
    const img = new Image();
    img.onload = img.onerror = () => done(u);
    img.src = u;
  })));
}

/** What an illustrator needs to know, kept next to the code that consumes it
 *  so the two cannot drift. Printed by the rig's "art status" panel. */
export const DELIVERY_SPEC = {
  format: 'WebP, sRGB',
  size: '2400x1200 (2x the 1200x600 logical stage)',
  layers: LAYERS,
  transparency: 'midground and foreground transparent; background opaque',
  light: 'ONE low-angle warm key from frame left, ~18 degrees, long soft shadows',
  style: 'gouache grain, watercolour edge-pooling, painterly. No vector-flat shading, no 3D.',
  forbidden: 'zero red anywhere; no UI panels, no black scrims, no confetti, no neon',
  path: '/art/<scene>/<layer>.webp',
};
