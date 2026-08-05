// Builds the recording script for /words -- every line Pip needs to speak.
//
// Generated from public/engine/speech.js, which is also what plays them at
// runtime. That is the point: a hand-maintained manifest drifts from the player
// and half a pack silently fails, which on this surface means a pre-reader is
// left staring at text.
//
// TWO CLIPS, NOT FIVE HUNDRED. An invitation is a station phrase plus a word.
// Recording every combination would be 6 x 85 = 510 lines. Recording them
// separately and playing them in sequence is 6 + 85 + chrome, and it is the
// approach the design bible already endorses for names.
//
//   npm run voice:words          -- write the script
//   OPENAI_API_KEY=... npm run voice:words -- --render   -- and render it
//
// Output: tools/voice/words-script.json, and (when rendering)
// public/voice/words/v1/*.mp3 plus index.json.

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ASK, CHROME, slug, wordLine } from '../../public/engine/speech.js';
import { LEX, STATIONS } from '../../public/engine/lexicon.js';
import { NAME_BANK } from '../../public/scene/naming.js';

const OUT_DIR = 'public/voice/words/v1';

/** Voice direction, carried with the script so a human or a TTS run gets the
 *  same instruction. Straight from docs/BRAND.md and the design bible. */
const DIRECTION =
  'Warm, unhurried, kneeling down to talk to a three-year-old. Never bright or '
  + 'performative, never hurried. The invitation lines END UNFINISHED, on a '
  + 'slight rise, because a word is spoken immediately after them -- do not '
  + 'let the pitch fall at the end. Word clips are said plainly and clearly on '
  + 'their own, as if naming the thing while pointing at it.';

const lines = [];
const seen = new Set();
const add = (id, text, note) => {
  if (seen.has(id)) return;
  seen.add(id);
  lines.push({ id, text, note });
};

// 1 -- station invitations, with and without a companion name.
for (const aff of Object.keys(STATIONS)) {
  const ask = ASK[aff];
  if (!ask) continue;
  const at = STATIONS[aff].name;
  add(`ask-${aff.toLowerCase()}`, ask.solo,
      `${at} -- whole line. ENDS UNFINISHED, slight rise: a word follows immediately.`);
  add(`ask-${aff.toLowerCase()}-after`, ask.after,
      `${at} -- follows a spoken NAME, so START mid-sentence as if continuing. Also ends unfinished.`);
}

// 2 -- every word in the lexicon, said alone.
for (const w of [...new Set(LEX.map((x) => x.w))].sort()) {
  add(wordLine(w).id, w, 'said plainly, on its own');
}

// 3 -- the surrounding chrome.
for (const c of Object.values(CHROME)) add(c.id, c.text, 'chrome');

// 4 -- the companion names. Recorded, never synthesised: a neural front end
//      mangles proper names, and a robot mispronouncing a child's chosen name
//      back at them is worse than not saying it.
for (const n of NAME_BANK) {
  add(`name-${slug(n.name)}`, n.name, 'a chosen companion name -- must be recorded, never synthesised');
}

const script = { packVersion: 'v1', voice: 'coral', direction: DIRECTION, count: lines.length, lines };
writeFileSync('tools/voice/words-script.json', JSON.stringify(script, null, 2) + '\n');

const naive = Object.keys(STATIONS).length * new Set(LEX.map((x) => x.w)).size;
console.log(`words script: ${lines.length} lines`);
console.log(`  (recording every station x word combination would be ${naive})`);

// Always (re)write the pack index from whatever is actually on disk, so the
// player's manifest can never claim a clip that is not there.
if (existsSync(OUT_DIR)) {
  const ids = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3')).map((f) => f.replace('.mp3', ''));
  // PRESERVE what the renderer recorded. Two tools write this file: the
  // renderer stamps which voice and model produced the pack, and this script
  // refreshes the id list. Writing a bare {ids} here silently erased that
  // provenance -- and the deployed pack shipped with no record of what voice
  // was in it, which is the one thing you need when a clip sounds wrong.
  let meta = {};
  try { const { ids: _, ...rest } = JSON.parse(readFileSync(join(OUT_DIR, 'index.json'), 'utf8')); meta = rest; }
  catch { /* no pack yet */ }
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ ids, ...meta }) + '\n');
  console.log(`  pack on disk: ${ids.length}/${lines.length} recorded`);
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ ids: [] }) + '\n');
  console.log('  pack on disk: 0 recorded -- /words falls back to the on-device voice');
}

// Rendering needs a key and is a separate, deliberate step.
if (process.argv.includes('--render')) {
  let KEY = process.env.OPENAI_API_KEY || '';
  if (!KEY) {
    try { KEY = readFileSync(join(homedir(), '.openclaw', '.credentials', 'openai-key.txt'), 'utf8').trim(); }
    catch { /* handled below */ }
  }
  if (!KEY) { console.error('OpenAI credential unavailable -- script written, nothing rendered'); process.exit(1); }
  const forceArg = process.argv.find((arg) => arg.startsWith('--force-id='));
  const forceIds = new Set((forceArg?.slice('--force-id='.length) || '').split(',').filter(Boolean));
  let done = 0;
  for (const line of lines) {
    const file = join(OUT_DIR, `${line.id}.mp3`);
    if (existsSync(file) && !forceIds.has(line.id)) { done++; continue; }
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: script.voice,
                             input: line.text, instructions: DIRECTION }),
    });
    if (!res.ok) { console.error(`  ${line.id}: ${res.status}`); continue; }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${lines.length}`);
  }
  const ids = readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3')).map((f) => f.replace('.mp3', ''));
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({
    ids, packVersion: script.packVersion, voice: script.voice, model: 'gpt-4o-mini-tts',
  }) + '\n');
  console.log(`rendered ${ids.length}/${lines.length}`);
}
