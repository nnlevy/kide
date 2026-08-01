// Generates public/art/manifest.json by scanning for delivered layers.
//
// Replaces per-layer HEAD probing. Probing was genuinely drop-in, but it fired
// three requests per scene -- eighteen console 404s a session before any art
// exists -- which is noise a real deployment should not carry.
//
// This runs inside `npm run build`, so dropping WebP files into
// public/art/<scene>/ and deploying normally still requires no extra step from
// anyone. The manifest is a build artifact, not something a human maintains.

import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCENES = ['GAP', 'REACH', 'DARK', 'HIDDEN', 'CLOSED', 'CARRY'];
const LAYERS = ['background', 'midground', 'foreground'];
const ART = 'public/art';

const manifest = {};
for (const scene of SCENES) {
  const dir = join(ART, scene.toLowerCase());
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const got = {};
  for (const layer of LAYERS) {
    // Match any extension so a .webp today and an .avif tomorrow both work
    // without touching this script.
    const hit = files.find((f) => f.startsWith(layer + '.'));
    if (hit) got[layer] = `/art/${scene.toLowerCase()}/${hit}`;
  }
  if (Object.keys(got).length) manifest[scene] = got;
}

mkdirSync(ART, { recursive: true });
writeFileSync(join(ART, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const layers = Object.values(manifest).reduce((a, o) => a + Object.keys(o).length, 0);
console.log(`art manifest: ${Object.keys(manifest).length} scene(s), ${layers} layer(s) delivered`);
