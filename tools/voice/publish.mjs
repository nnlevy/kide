// Publish the rendered voice pack into public/voice/v1.
//
// WHY THIS FILE HAD TO EXIST. generate.js writes what the TTS API returns:
// 128 kbps mono MP3. The pack that has been shipping is 48 kbps mono — the
// same audio, a third of the bytes. Nothing in the repo performed that step,
// so it had been done by hand at some point and then forgotten, and the next
// person to run `npm run voice:render` (which was me) got a pack 3x heavier
// than the one in production with nothing to tell them why.
//
// The size matters and is not an aesthetic preference. This is a game for
// two-year-olds on a family tablet, frequently on a phone hotspot in a car,
// and the voice pack is downloaded before Pip can say anything at all.
// test-voice-pack.mjs holds the whole pack under 3 MB for that reason; at the
// raw bitrate, 108 clips come to 6.4 MB.
//
// 48 kbps mono at 24 kHz is the profile already proven in production: it is
// what every currently shipped clip is, and the suite's own checks on lead-in
// silence, truncation and speech rate pass against it. Speech at this bitrate
// is indistinguishable from the source on a tablet speaker.
//
//   node tools/voice/publish.mjs
//
// Run after generate.js. Idempotent: re-encoding an unchanged clip produces
// the same bytes, so re-running is free and the git diff stays honest.

import { readdirSync, mkdirSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const M = require(join(here, 'manifest.js'));

const SRC = join(here, 'out', M.packVersion);
const OUT = join(here, '..', '..', 'public', 'voice', M.packVersion);

/* The published profile. Changing these is a decision about what a family
   downloads before the game will speak, so they live here with the reason
   rather than inline in a command. */
const BITRATE = '48k';
const SAMPLE_RATE = '24000';
const CHANNELS = '1';
const SIZE_BUDGET_MB = 3;

if (!existsSync(SRC)) {
  console.error(`no rendered pack at ${SRC} — run "npm run voice:render" first`);
  process.exit(1);
}
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
catch { console.error('ffmpeg is required to publish the voice pack'); process.exit(1); }

mkdirSync(OUT, { recursive: true });

const wanted = M.lines.map((l) => l.id);
const rendered = new Set(
  readdirSync(SRC).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)),
);
const missing = wanted.filter((id) => !rendered.has(id));
if (missing.length) {
  console.error(`${missing.length} line(s) in the manifest were never rendered: `
    + `${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`);
  console.error('run "npm run voice:render" first');
  process.exit(1);
}

let bytesIn = 0, bytesOut = 0;
for (const id of wanted) {
  const from = join(SRC, `${id}.mp3`);
  const to = join(OUT, `${id}.mp3`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', from,
    '-map_metadata', '-1',   // no timestamps, so the same input gives the same bytes
    // Trailing silence only. The model often leaves a second or more of room
    // at the end, which costs bytes and, worse, counts against the player's
    // ceiling on how long it will wait for Pip before advancing — a line can
    // be cut off because of silence rather than speech. Leading silence is
    // left alone deliberately: trimming the front risks clipping a soft
    // opening consonant, and it is short enough not to matter.
    '-af', 'areverse,silenceremove=start_periods=1:start_silence=0.08:'
         + 'start_threshold=-45dB:detection=peak,areverse',
    '-ac', CHANNELS, '-ar', SAMPLE_RATE, '-b:a', BITRATE,
    to,
  ]);
  bytesIn += statSync(from).size;
  bytesOut += statSync(to).size;
}

/* Clips that are no longer in the manifest must not linger: the index would
   not name them, but they would still be committed, served and downloaded. */
for (const f of readdirSync(OUT)) {
  if (!f.endsWith('.mp3')) continue;
  if (!wanted.includes(f.slice(0, -4))) { rmSync(join(OUT, f)); console.log(`  removed stale ${f}`); }
}

/* The browser-side index. `model` is recorded alongside `voice` because a
   re-render with a different model is an audible change to every line, and the
   only way to know afterwards which one produced the pack is to have written
   it down. */
writeFileSync(join(OUT, 'index.json'), JSON.stringify({
  version: M.packVersion,
  voice: M.voice,
  model: M.model,
  ids: wanted,
}));

const mb = bytesOut / 1024 / 1024;
console.log(`voice pack: ${wanted.length} clips, ${mb.toFixed(2)} MB `
  + `(from ${(bytesIn / 1024 / 1024).toFixed(2)} MB raw, ${BITRATE} mono ${SAMPLE_RATE}Hz)`);
if (mb > SIZE_BUDGET_MB) {
  console.error(`OVER BUDGET: ${mb.toFixed(2)} MB exceeds the ${SIZE_BUDGET_MB} MB a family downloads`);
  process.exit(1);
}
