// Render the /words voice pack.
//
// WHY ELEVENLABS AND NOT THE OTHER KEY IN THE DRAWER. The whole architecture of
// this pack is a splice: an invitation is a phrase clip followed by a word clip,
// so 116 recordings cover what would otherwise take 510. That only works if the
// two clips sound like one sentence. ElevenLabs takes `previous_text` and
// `next_text` -- context the model conditions its prosody on but does not speak.
// So the phrase is rendered KNOWING a word follows it (and keeps its rise), and
// the word is rendered KNOWING it completes a question (and lands rather than
// starts). That is precisely the hard part of splicing, solved by the API.
// OpenAI's TTS takes a style instruction but has no cross-clip continuity, so
// every clip would be rendered in ignorance of its neighbours.
//
// CONSISTENCY OVER EXPRESSIVENESS. 116 clips recombine in ~500 orders. A voice
// that performs each line beautifully but differently would betray the splice
// instantly. High stability, zero style exaggeration -- which also happens to be
// the brand direction ("never bright or performative").
//
// Usage:  node tools/voice/render-words.mjs [--voice <id>] [--sample] [--force]

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const OUT = 'public/voice/words/v1';
const SCRIPT = 'tools/voice/words-script.json';
const MODEL = 'eleven_multilingual_v2';   // the quality tier; latency is irrelevant offline
const FORMAT = 'mp3_44100_128';

/* -- the voice ------------------------------------------------------------
 * The key file ships with Adam ("Dominant, Firm"), a leftover from another
 * project and the opposite of a companion kneeling down to a three-year-old.
 * Chosen deliberately here instead, against the brand direction: warm,
 * reassuring, unhurried, NOT bright and NOT performative -- which rules out
 * every voice labelled playful, energetic or social_media.
 */
const VOICE = { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah -- mature, reassuring' };

const ALTERNATES = [                       // rendered by --sample so a swap is one flag
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda -- warm, knowledgable' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily -- velvety, calm (british)' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice -- clear, engaging (british)' },
];

// Same for every clip. Drift between takes is the one thing a splice cannot
// survive, so stability is high and style is zero.
// `speed` is the one setting that was MEASURED rather than chosen. At the
// default the pack came out at 4.22 words/sec -- adult conversational pace, and
// a straight failure of the brand direction ("warm, unhurried, kneeling down to
// talk to a three-year-old"). Adults speaking to toddlers slow to roughly
// 2.5-3.5 words/sec; 0.85 puts this at 3.15. Slower than ~0.75 hits the API's
// clamp and starts to drag, which reads as patronising rather than gentle.
const SETTINGS = {
  stability: 0.62, similarity_boost: 0.78, style: 0.0, use_speaker_boost: true, speed: 0.85,
};

/* -- prosodic context -----------------------------------------------------
 * What the model is told comes BEFORE and AFTER each clip. Never spoken; it
 * only shapes the delivery. This is the entire reason the pack can be spliced.
 */
const SAMPLE_WORD = 'rope.';
const SAMPLE_NAME = 'Butterbean';

function context(id, text) {
  // A word clip completes a question, so it must land, not start.
  if (id.startsWith('w-')) return { previous_text: 'Can you say', next_text: '' };
  // A name leads an invitation, so it must hand over rather than conclude.
  if (id.startsWith('name-')) return { previous_text: '', next_text: 'needs a way across. Can you say' };
  // An `-after` take continues from a spoken name AND hands on to a word.
  if (id.endsWith('-after')) return { previous_text: SAMPLE_NAME, next_text: SAMPLE_WORD };
  // A solo invitation is a whole sentence that hands on to a word.
  if (id.startsWith('ask-')) return { previous_text: '', next_text: SAMPLE_WORD };
  if (id === 'chrome-wake') return { previous_text: '', next_text: SAMPLE_WORD };
  return { previous_text: '', next_text: '' };
}

/* -- key ------------------------------------------------------------------ */
function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const p of [join(homedir(), '.openclaw/credentials/elevenlabs.json'),
                   '/sessions/eloquent-dazzling-hamilton/mnt/.openclaw/credentials/elevenlabs.json']) {
    try { return JSON.parse(readFileSync(p, 'utf8')).apiKey; } catch { /* next */ }
  }
  console.error('No ElevenLabs key. Set ELEVENLABS_API_KEY or put it in ~/.openclaw/credentials/elevenlabs.json');
  process.exit(1);
}

async function tts(key, voiceId, text, ctx) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS, ...ctx }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

/* -- main ----------------------------------------------------------------- */
const args = process.argv.slice(2);
const key = apiKey();
const voiceId = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : VOICE.id;
const script = JSON.parse(readFileSync(SCRIPT, 'utf8'));
mkdirSync(OUT, { recursive: true });

// --sample: one invitation + one word in each candidate voice, so the choice
// can be made by ear in thirty seconds rather than argued about.
if (args.includes('--sample')) {
  mkdirSync('public/voice/samples', { recursive: true });
  const demo = [
    ['ask', "There's a gap here. Can you say", { previous_text: '', next_text: SAMPLE_WORD }],
    ['word', 'rope', { previous_text: 'Can you say', next_text: '' }],
  ];
  for (const v of [VOICE, ...ALTERNATES]) {
    for (const [kind, text, ctx] of demo) {
      const buf = await tts(key, v.id, text, ctx);
      writeFileSync(`public/voice/samples/${v.name.split(' ')[0].toLowerCase()}-${kind}.mp3`, buf);
    }
    console.log(`  sampled ${v.name}`);
  }
  console.log('\nsamples in public/voice/samples/ -- play the two files for each voice back to back;');
  console.log('they should sound like one sentence, not two files.\n');
  process.exit(0);
}

console.log(`rendering ${script.count} lines as ${VOICE.name}`);
console.log(`  model ${MODEL}, ${FORMAT}, stability ${SETTINGS.stability}, speed ${SETTINGS.speed}\n`);

/* -- what each clip was rendered WITH -------------------------------------
 * Resuming on "the file exists" is not enough. Changing the voice or the speed
 * has to invalidate the clips rendered under the old setting -- otherwise an
 * interrupted re-render leaves a pack that is half one voice and half another,
 * which is invisible on disk and obvious the moment a child hears it. (That
 * happened once, mid-way through changing the speaking rate.)
 *
 * So each clip records a fingerprint of everything that shaped it. A clip is
 * reused only when its fingerprint still matches.
 */
const STATE = join(OUT, '.render-state.json');
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const fingerprint = (line) => createHash('sha1').update(JSON.stringify({
  voiceId, MODEL, FORMAT, SETTINGS, text: line.text, ctx: context(line.id, line.text),
})).digest('hex').slice(0, 12);

let made = 0, skipped = 0, failed = [];
for (const line of script.lines) {
  const file = join(OUT, `${line.id}.mp3`);
  const fp = fingerprint(line);
  if (existsSync(file) && state[line.id] === fp && !args.includes('--force')) { skipped++; continue; }
  try {
    writeFileSync(file, await tts(key, voiceId, line.text, context(line.id, line.text)));
    state[line.id] = fp;
    writeFileSync(STATE, JSON.stringify(state));
    made++;
    if (made % 20 === 0) console.log(`  ${made + skipped}/${script.count}`);
  } catch (e) {
    failed.push(`${line.id}: ${e.message}`);
  }
}

// The index is always rewritten from what is ACTUALLY on disk. If the player's
// manifest could claim a clip that failed to render, the failure would surface
// as a child hearing silence in the middle of a sentence.
const ids = readdirSync(OUT).filter((f) => f.endsWith('.mp3') && statSync(join(OUT, f)).size > 512)
  .map((f) => f.replace('.mp3', ''));
writeFileSync(join(OUT, 'index.json'), JSON.stringify({
  ids, voice: VOICE.name, model: MODEL, renderedAt: new Date().toISOString(),
}) + '\n');

console.log(`\n${made} rendered, ${skipped} already present, ${failed.length} failed`);
if (failed.length) { failed.slice(0, 8).forEach((f) => console.log('  x ' + f)); process.exitCode = 1; }
const stale = script.lines.filter((l) => state[l.id] !== fingerprint(l)).length;
console.log(`pack: ${ids.length}/${script.count} usable clips` + (stale ? `, ${stale} STALE (rendered with different settings) -- rerun to refresh` : ''));
