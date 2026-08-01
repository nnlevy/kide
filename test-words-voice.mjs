// Does /words actually talk?
//
// The product's central accessibility claim is that a child who cannot read a
// word can still play alone. /words shipped violating it: every line was text.
// These tests exist so that cannot happen again quietly -- in particular the
// last one, which fails if ANY new caption is added without a voice route.

import { readFileSync } from 'node:fs';
import assert from 'node:assert';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const ta = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

// The module fetches its manifest on first use. Default: no pack on disk, which
// is the state /words is actually in today.
let PACK = [];
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ids: PACK }) });

const Speech = await import('./public/engine/speech.js');
const { LEX } = await import('./public/engine/lexicon.js');
const { NAME_BANK } = await import('./public/scene/naming.js');
const script = JSON.parse(readFileSync('tools/voice/words-script.json', 'utf8'));
const scriptIds = new Set(script.lines.map((l) => l.id));
const words = new URL('./public/words/index.html', import.meta.url);
const wordsHtml = readFileSync(words, 'utf8');

console.log('\nrecording script covers what the player asks for');

await ta('every station invitation, both takes, is in the script', async () => {
  for (const aff of Object.keys(Speech.ASK)) {
    const solo = await Speech.askVoice(aff, 'rope', null);
    const named = await Speech.askVoice(aff, 'rope', 'Butterbean');
    for (const line of [...solo, ...named]) {
      assert(scriptIds.has(line.id), `${line.id} is played but never recorded`);
    }
  }
});

t('every lexicon word has a clip in the script', () => {
  const missing = [...new Set(LEX.map((x) => x.w))]
    .map((w) => Speech.wordLine(w).id).filter((id) => !scriptIds.has(id));
  assert.equal(missing.length, 0, `not recorded: ${missing.slice(0, 5).join(', ')}`);
});

t('every chrome line is in the script', () => {
  for (const c of Object.values(Speech.CHROME)) {
    assert(scriptIds.has(c.id), `${c.id} is played but never recorded`);
  }
});

t('every companion name is in the script', () => {
  for (const n of NAME_BANK) {
    assert(scriptIds.has(`name-${Speech.slug(n.name)}`), `${n.name} not recorded`);
  }
});

t('splicing is why the script is small', () => {
  const naive = Object.keys(Speech.ASK).length * new Set(LEX.map((x) => x.w)).size;
  assert(script.count < naive / 3,
    `${script.count} lines is not meaningfully cheaper than ${naive}`);
});

console.log('\nnames are never synthesised');

await ta('with no recording, the name is left out entirely', async () => {
  PACK = [];
  const lines = await Speech.askVoice('GAP', 'rope', 'Marmalade');
  const spoken = lines.map((l) => l.text).join(' ');
  assert(!/Marmalade/i.test(spoken), `a synthesiser would have said: "${spoken}"`);
  assert(/gap here/.test(spoken), 'the name-free take should be used instead');
});

await ta('nameVoice returns nothing rather than guessing', async () => {
  assert.deepEqual(await Speech.nameVoice('Zephyrine'), []);
});

console.log('\nthe splice is ordered so a name can lead');

t('no invitation asks for a name in the middle of a sentence', () => {
  // `after` takes follow a spoken name, so they must START mid-sentence --
  // lower case, no leading capital that would sound like a fresh start.
  for (const [aff, a] of Object.entries(Speech.ASK)) {
    assert(/^[a-z]/.test(a.after), `${aff}.after starts capitalised: "${a.after}"`);
    assert(!/\bNAME\b/.test(a.solo + a.after), `${aff} still has a name hole`);
  }
});

t('every invitation ends unfinished so a word can land after it', () => {
  for (const [aff, a] of Object.entries(Speech.ASK)) {
    for (const take of ['solo', 'after']) {
      assert(!/[.!?]$/.test(a[take]), `${aff}.${take} ends closed: "${a[take]}"`);
    }
  }
});

console.log('\nsequencing: a clip is never cut off by the next one');

await ta('sayAll waits for each line to END, never on a timer', async () => {
  // No Audio and no speechSynthesis: every line resolves false immediately,
  // which must STOP the chain rather than firing them all at once.
  const order = [];
  const real = Speech.say;
  PACK = [];
  let overlapping = 0, live = 0;
  globalThis.speechSynthesis = {
    cancel() {},
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true }],
    speak(u) {
      live++;
      if (live > 1) overlapping++;
      order.push(u.text);
      setTimeout(() => { live--; u.onend && u.onend(); }, 12);
    },
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };

  await Speech.sayAll([{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
  assert.deepEqual(order, ['one', 'two', 'three'], 'lines spoken out of order');
  assert.equal(overlapping, 0, 'two lines were speaking at once');
});

await ta('a superseded line stops the rest of the chain', async () => {
  const spoken = [];
  globalThis.speechSynthesis = {
    cancel() {},
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true }],
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 8); },
  };
  const chain = Speech.sayAll([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
  setTimeout(() => Speech.stop(), 4);        // a new invitation interrupts
  const ok = await chain;
  assert.equal(ok, false, 'an interrupted chain should report failure');
  assert(spoken.length < 3, `kept going after being interrupted: ${spoken.join(',')}`);
});

console.log('\nprivacy: the fallback voice never leaves the device');

await ta('a remote synthesis voice is declined, even if it is the only one', async () => {
  const spoken = [];
  globalThis.speechSynthesis = {
    cancel() {},
    // localService:false means the browser ships the text to a server.
    getVoices: () => [{ name: 'Google UK English', lang: 'en-GB', localService: false }],
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); },
  };
  const ok = await Speech.say({ text: 'hello' });
  assert.equal(spoken.length, 0, 'text was sent to a remote voice');
  assert.equal(ok, false, 'silence must be reported as not-spoken');
});

await ta('routeFor is honest about which of the three routes is in use', async () => {
  globalThis.speechSynthesis = {
    cancel() {}, speak() {},
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true }],
  };
  assert.equal(await Speech.routeFor({ text: 'x' }), 'device');
  globalThis.speechSynthesis.getVoices = () => [];
  assert.equal(await Speech.routeFor({ text: 'x' }), 'silent');
});

console.log('\nno caption reaches a child silently');

t('/words attaches a voice to the scene', () => {
  assert(/scene\.withVoice\(/.test(wordsHtml), '/words never attaches a speaker');
});

t('EVERY caption in /words has a voice route', () => {
  // This is the test that stops the original bug coming back. A `say(...)` or
  // `caption:` with no second argument falls back to reading the caption text
  // through the device voice -- acceptable. What is NOT acceptable is a caption
  // written straight into the DOM, bypassing the scene, because nothing will
  // ever speak it.
  const direct = [...wordsHtml.matchAll(/\.sc-caption[^\n]*(textContent|innerHTML)\s*=/g)];
  assert.equal(direct.length, 0,
    'a caption is written directly to the DOM, so it is never spoken');
});

t('no fixed timer sits between two spoken lines', () => {
  // `await wait(N)` between two say() calls is exactly the bug that truncated
  // Pip in the garden games: the caption is replaced while the clip is still
  // playing. Every gap must be `await said(...)`, which waits for the END.
  const body = wordsHtml.slice(wordsHtml.indexOf('async function begin'));
  const bad = [...body.matchAll(/say\([^)]*\)[\s\S]{0,120}?await wait\(/g)];
  assert.equal(bad.length, 0,
    `${bad.length} spoken line(s) followed by a fixed timer instead of await said()`);
});

t('the pacing helper has a ceiling above the clip cap', () => {
  const ceiling = +(/SPEECH_CEILING_MS\s*=\s*(\d+)/.exec(wordsHtml) || [])[1];
  const cap = +(/setTimeout\(done,\s*(\d+)\)/.exec(
    readFileSync('public/engine/speech.js', 'utf8')) || [])[1];
  assert(ceiling > cap,
    `ceiling ${ceiling}ms would cut off a clip capped at ${cap}ms -- this exact `
    + 'off-by-one shipped once already');
});

t('a backgrounded tab goes quiet', () => {
  assert(/visibilitychange[\s\S]{0,120}Speech\.stop/.test(wordsHtml),
    'a voice would keep talking from a pocket');
});

t('audio is unlocked on a real user gesture', () => {
  assert(/pointerdown[\s\S]{0,80}Speech\.unlock/.test(wordsHtml),
    'iOS would refuse to play the opening line');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
