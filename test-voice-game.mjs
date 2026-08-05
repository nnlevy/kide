// The pack Pip speaks from in the game.
//
// WHY THIS FILE EXISTS. test-voice-pack.mjs is named as though it covers the
// voice, and covers the WORDS pack — the separate one /words uses. The pack
// behind /play, built from tools/voice/manifest.js into public/voice/v1, had
// no test at all. Nobody noticed because both are called "the voice pack",
// both live under public/voice, and the existing suite passes loudly.
//
// It surfaced when 48 new lines for Letters and Feelings sat un-rendered in
// the manifest and every voice assertion in the repo stayed green. A pack that
// can silently lose the line a child is waiting to hear deserves better,
// because the failure is not an error message — it is a two-year-old sitting
// in front of a question nobody asked them.
//
// The other thing this closes is the gap between the game and the pack. The
// prompt id is computed in play/index.html ("prompt-letter-" + target) and the
// clip is named in manifest.js, in two files, in two languages, with nothing
// connecting them. Every id the game can construct is derived here from the
// game's own data tables and checked against what actually shipped.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = 'public/voice/v1';
const M = require('./tools/voice/manifest.js');

if (!existsSync(join(OUT, 'index.json'))) {
  console.log('\n(SKIPPED test-voice-game: no pack published -- npm run voice:publish)\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
const onDisk = new Set(readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
const page = readFileSync('public/play/index.html', 'utf8');
const browserRegistrySource = readFileSync('public/voice-manifest.js', 'utf8');
const browserSandbox = { window: {} };
vm.createContext(browserSandbox);
vm.runInContext(browserRegistrySource, browserSandbox);
const browserRegistry = browserSandbox.window.KideVoiceRegistry;

console.log('\nthe game pack is complete');

t('every line Pip is scripted to say has been rendered', () => {
  const missing = M.lines.map((l) => l.id).filter((id) => !index.ids.includes(id));
  assert.equal(missing.length, 0,
    `${missing.length} line(s) never rendered: ${missing.slice(0, 6).join(', ')}`);
});

t('no line is left marked pending', () => {
  // `pending` was scaffolding for shipping copy ahead of a render. It is not a
  // resting state: a pending line is one a child hears in a flatter voice.
  const stuck = M.lines.filter((l) => l.pending).map((l) => l.id);
  assert.equal(stuck.length, 0, `still awaiting render: ${stuck.join(', ')}`);
});

t('the index claims nothing that is not on disk', () => {
  const phantom = index.ids.filter((id) => !onDisk.has(id));
  assert.equal(phantom.length, 0,
    `${phantom.length} clip(s) claimed but absent -- a child would hear silence`);
});

t('nothing is shipped that the script no longer asks for', () => {
  const scripted = new Set(M.lines.map((l) => l.id));
  const orphans = [...onDisk].filter((id) => !scripted.has(id));
  assert.equal(orphans.length, 0,
    `${orphans.length} stale clip(s) still being served: ${orphans.slice(0, 6).join(', ')}`);
});

t('the pack records the voice and the model that made it', () => {
  assert(index.voice, 'no voice recorded in index.json');
  assert(index.model, 'no model recorded in index.json');
  assert.equal(index.version, M.packVersion, 'the index and the manifest disagree on the version');
});

t('the browser registry is generated from the full manifest', () => {
  assert(browserRegistry, 'voice-manifest.js did not create KideVoiceRegistry');
  assert.equal(browserRegistry.packVersion, M.packVersion, 'runtime pack version drifted');
  assert.deepEqual(
    JSON.parse(JSON.stringify(browserRegistry.lines)),
    Object.fromEntries(M.lines.map((line) => [line.id, line.text])),
    'runtime ids or fallback text drifted from tools/voice/manifest.js',
  );
});

t('the generated registry loads before the player', () => {
  const registryAt = page.indexOf('/voice-manifest.js');
  const playerAt = page.indexOf('/voice.js');
  assert(registryAt > -1 && playerAt > registryAt,
    'voice-manifest.js must load before voice.js');
});

t('replay is a real accessible button, not a clickable status card', () => {
  assert(/<button type="button" class="replay" data-act="replay" aria-label="Hear this prompt again">/.test(page),
    'replay is not an explicit labelled button');
  assert(!/prompt-card"[^>]*data-act="replay"/.test(page),
    'the status card still pretends to be the replay control');
});

console.log('\nthe game asks for exactly what the pack contains');

t('every prompt id the game can construct has a clip', () => {
  // Derived from the game's own tables rather than from a list kept here, so
  // adding a letter or a feeling to play/index.html without a voice line fails
  // this immediately instead of at a child's bedtime.
  const slice = (a, b) => {
    const i = page.indexOf(a); const j = page.indexOf(b, i + 1);
    assert(i > -1 && j > i, `could not lift ${a} out of play/index.html`);
    return page.slice(i, j);
  };
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    slice('const COLORS = {', "/* ========================= PIP'S TURN")
    + '\nObject.assign(globalThis,{COLORS,SHAPES,ALL_LETTERS,FEELINGS,FEELING_STORIES});', sandbox);

  const expected = [
    ...Object.keys(sandbox.COLORS).map((c) => `prompt-color-${c}`),
    ...Object.keys(sandbox.SHAPES).map((s) => `prompt-shape-${s}`),
    ...Object.keys(sandbox.SHAPES).map((s) => `prompt-collect-${s}`),
    ...sandbox.ALL_LETTERS.map((l) => `prompt-letter-${l.toLowerCase()}`),
    ...Object.keys(sandbox.FEELINGS).map((f) => `prompt-feeling-${f}`),
    ...sandbox.FEELING_STORIES.map((s) => s.id),
    'prompt-count', 'listen-color', 'listen-count', 'listen-shape',
    'listen-letter', 'listen-feeling', 'listen-garden', 'listen-again',
    'garden-intro', 'goodbye', 'home-greet', 'sleepy-invite', 'handoff-hello',
  ];
  const missing = expected.filter((id) => !index.ids.includes(id));
  assert.equal(missing.length, 0,
    `the game can ask for ${missing.length} clip(s) that do not exist: ${missing.slice(0, 8).join(', ')}`);
});

t('a counting answer exists for every number the game can show', () => {
  const tiers = page.match(/const COUNT_TIERS = \{[\s\S]*?\n\};/);
  assert(tiers, 'COUNT_TIERS has gone');
  const maxes = [...tiers[0].matchAll(/max:\s*(\d+)/g)].map((m) => +m[1]);
  const top = Math.max(...maxes);
  for (let n = 1; n <= top; n++) {
    assert(index.ids.includes(`answer-${n}`),
      `counting goes to ${top} but there is no clip for "${n}"`);
  }
});

console.log('\nthe pack is small enough for a family to download');

t('the whole pack stays under 3 MB', () => {
  // A tablet in a car on a phone hotspot downloads all of this before Pip can
  // say anything. The API returns 128 kbps; tools/voice/publish.mjs re-encodes
  // to the 48 kbps mono profile that has always shipped, and without that step
  // these 108 clips come to 6.1 MB.
  const bytes = [...onDisk].reduce((n, id) => n + statSync(join(OUT, `${id}.mp3`)).size, 0);
  const mb = bytes / 1024 / 1024;
  console.log(`       (${mb.toFixed(2)} MB for ${onDisk.size} clips)`);
  assert(mb < 3, `${mb.toFixed(2)} MB is too much to ask a family to download`);
});

let ffprobe = true;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { ffprobe = false; }

t('every clip is published at the agreed profile, not whatever the API returned', () => {
  if (!ffprobe) { console.log('       (skipped: ffprobe not installed)'); return; }
  // EVERY clip, not a sample. The first version checked the first twelve and
  // missed a raw 128 kbps file dropped in at position sixty — which is exactly
  // how the publish step gets skipped for one clip and nobody finds out.
  // Probing all 108 costs under three seconds.
  for (const id of index.ids) {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'stream=channels,sample_rate,bit_rate', '-of', 'default=nw=1', join(OUT, `${id}.mp3`)]).toString();
    const channels = +(out.match(/channels=(\d+)/) || [])[1];
    const rate = +(out.match(/sample_rate=(\d+)/) || [])[1];
    const bits = +(out.match(/bit_rate=(\d+)/) || [])[1];
    assert.equal(channels, 1, `${id} is not mono`);
    assert.equal(rate, 24000, `${id} is not 24 kHz`);
    assert(bits <= 64000, `${id} is ${Math.round(bits / 1000)} kbps — the publish step was skipped`);
  }
});

t('no clip is empty or truncated', () => {
  if (!ffprobe) { console.log('       (skipped: ffprobe not installed)'); return; }
  const bad = index.ids.filter((id) => statSync(join(OUT, `${id}.mp3`)).size < 1200);
  assert.equal(bad.length, 0, `suspiciously small: ${bad.slice(0, 5).join(', ')}`);
  for (const id of index.ids.slice(0, 10)) {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1', join(OUT, `${id}.mp3`)]).toString().trim();
    const d = parseFloat(out);
    assert(d > 0.25, `${id} is ${d}s — too short to be a line`);
    assert(d < 9, `${id} is ${d}s — longer than the player will wait`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
