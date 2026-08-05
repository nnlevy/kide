// speech.js -- Pip talks in /words.
//
// THE PROBLEM THIS FIXES. The product's central accessibility promise is that
// "a two-year-old who can't read a word can still play alone". /words shipped
// rendering every invitation as TEXT. For the exact user the product is for, it
// was unusable without an adult reading it out. That is not a missing nicety;
// it is the core promise broken on the newest surface.
//
// TWO CLIPS, NOT FIVE HUNDRED. An invitation is a station phrase plus a word --
// "Butterbean needs a ... rope". Recording every combination would be 6
// stations x 85 words = 510 lines. Recording the phrase and the word separately
// and playing them in sequence is 6 + 85 = 91, and it is the approach the
// design bible already endorses for names ("splice at prosodic boundaries").
// The phrase is written to END on a rising, unfinished note so the word lands
// naturally after it.
//
// SEQUENCING IS THE DANGEROUS PART, and it is the exact bug class that shipped
// in /play: a fixed timer between two clips truncates the first. Here the
// second clip starts only when the first has actually ENDED. Never a timer.
//
// FALLBACK IS ON-DEVICE ONLY. When a clip is missing, the browser's own
// speechSynthesis reads the line -- and only with a LOCAL voice. A remote
// speechSynthesis voice sends text to a server, which would quietly break the
// promise the whole product rests on, so a remote voice is declined and the
// line stays silent-but-captioned instead.
//
// NAMES ARE NEVER SYNTHESISED. The bible is explicit, and the reason is
// concrete: neural front-ends mangle uncommon proper names, and a robot
// mispronouncing a child's chosen name back at them is worse than not saying
// it. If we have no recording for a name, we say the line WITHOUT it rather
// than guessing at it.

export const PACK_BASE = '/voice/words/v1';

let manifest = null;          // id -> true, from the pack's index.json
let audioEl = null;
let epoch = 0;                // bumped on every new line; stale clips resolve false
let unlocked = false;
let unlocking = null;
// A real, tiny MP3 is required here. Calling play() on an <audio> element with
// no source can leave its promise pending forever in Chrome/Safari, which used
// to freeze the first friend tap before the screen could advance.
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7uf/////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYbdyBb/AAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch(`${PACK_BASE}/index.json`);
    manifest = res.ok ? new Set((await res.json()).ids || []) : new Set();
  } catch {
    manifest = new Set();
  }
  return manifest;
}

function el() {
  if (!audioEl && typeof Audio !== 'undefined') {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

/** iOS will not play audio until a real user gesture has touched an element.
 *  Call from the first tap; harmless everywhere else. */
export async function unlock() {
  if (unlocked) return true;
  if (unlocking) return unlocking;
  unlocking = (async () => {
    const a = el();
    if (!a) return false;
    try {
      a.muted = true;
      a.src = SILENT_MP3;
      await a.play().catch(() => {});
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      unlocked = true;
    } catch { /* stays locked; captions still carry the game */ }
    return unlocked;
  })();
  try { return await unlocking; }
  finally { unlocking = null; }
}

export function stop() {
  epoch++;
  try { audioEl?.pause(); if (audioEl) audioEl.currentTime = 0; } catch { /* nothing playing */ }
  try { globalThis.speechSynthesis?.cancel(); } catch { /* not supported */ }
}

/** Is a local (on-device) synthesis voice available? A remote voice would send
 *  the text to a server, so it is not acceptable here at any quality. */
function localVoice() {
  const s = globalThis.speechSynthesis;
  if (!s || typeof s.getVoices !== 'function') return null;
  const voices = s.getVoices() || [];
  // `localService` is the browser telling us it will not leave the device.
  const local = voices.filter((v) => v.localService && /^en(-|$)/i.test(v.lang || ''));
  if (!local.length) return null;
  const preferred = ['samantha', 'karen', 'moira', 'aria', 'jenny', 'zira'];
  for (const p of preferred) {
    const hit = local.find((v) => (v.name || '').toLowerCase().includes(p));
    if (hit) return hit;
  }
  return local[0];
}

function synth(text, myEpoch) {
  return new Promise((resolve) => {
    const s = globalThis.speechSynthesis;
    const v = localVoice();
    if (!s || !v) return resolve(false);        // no on-device voice: stay silent
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v;
      u.lang = v.lang || 'en-US';
      u.rate = 0.92;                             // unhurried, per the voice direction
      u.pitch = 1.05;
      const done = () => resolve(epoch === myEpoch);
      u.onend = done;
      u.onerror = done;
      s.cancel();
      s.speak(u);
      // A stalled utterance must never hang the game.
      setTimeout(done, 9000);
    } catch { resolve(false); }
  });
}

function playClip(id, myEpoch) {
  return new Promise((resolve) => {
    const a = el();
    if (!a) return resolve(false);
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok && epoch === myEpoch); } };
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.src = `${PACK_BASE}/${id}.mp3`;
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => done(false));
    setTimeout(() => done(true), 9000);
  });
}

/**
 * Speak one line.
 *
 * @param {{id?:string, text:string}} line  `id` selects a recorded clip when the
 *   pack has one; `text` is what a local voice would read instead.
 * @returns {Promise<boolean>} true if it played to the end and was not
 *   superseded -- callers that chain MUST check, exactly as /play does.
 */
export async function say(line) {
  if (!line || !line.text) return false;
  stop();
  const myEpoch = epoch;
  const m = await loadManifest();
  if (line.id && m.has(line.id)) return playClip(line.id, myEpoch);
  return synth(line.text, myEpoch);
}

/**
 * Speak several lines in order, each starting only when the previous has
 * ENDED. This is how a phrase and a word are spliced without a timer between
 * them -- a fixed gap is exactly what truncated Pip in /play.
 *
 * Stops early if a line is superseded, so a new invitation cannot end up
 * talking over the tail of the last one.
 */
export async function sayAll(lines) {
  for (const line of lines) {
    if (!line) continue;
    const ok = await say(line);
    if (!ok) return false;
  }
  return true;
}

/** Which route a given line would take. Lets a surface be honest about whether
 *  it is speaking in the real voice, a device voice, or not at all. */
export async function routeFor(line) {
  const m = await loadManifest();
  if (line?.id && m.has(line.id)) return 'recorded';
  return localVoice() ? 'device' : 'silent';
}

export async function packAvailable() {
  return (await loadManifest()).size > 0;
}

/* ---------------------------------------------------------------------------
 * Line construction. Kept here so the ids used at runtime and the ids in the
 * recording script are generated by the SAME code -- a manifest that drifts
 * from the player is how half a pack silently fails to play.
 * ------------------------------------------------------------------------ */

/** A word, as its own clip. */
export const wordLine = (w) => ({ id: `w-${slug(w)}`, text: w });

/**
 * The station's invitation: a phrase that ends unfinished, then the word.
 *
 * The companion's name is used ONLY if we hold a recording of it. Otherwise the
 * phrase is rewritten to avoid the name entirely -- "Someone needs a way
 * across" rather than a synthesiser guessing at "Marmalade". A robot
 * mispronouncing the name a child just chose is worse than not saying it.
 */
export async function askVoice(affordance, word, name) {
  const m = await loadManifest();
  const nameId = name ? `name-${slug(name)}` : null;
  const ask = ASK[affordance] || ASK.GAP;
  const base = `ask-${String(affordance).toLowerCase()}`;

  // A name can only be spliced at the START of a phrase -- a splice mid-sentence
  // lands on the wrong intonation and sounds broken. So the named take is
  // written as "<name>" + "<continuation>", never as one sentence with a hole
  // in the middle. Three clips: name, continuation, word.
  if (nameId && m.has(nameId)) {
    return [{ id: nameId, text: name },
            { id: `${base}-after`, text: ask.after },
            wordLine(word)];
  }
  return [{ id: base, text: ask.solo }, wordLine(word)];
}

/** Speak a name only when we hold a recording of it; otherwise stay quiet
 *  about it rather than guessing at the pronunciation. */
export async function nameVoice(name) {
  const m = await loadManifest();
  const id = `name-${slug(name)}`;
  return m.has(id) ? [{ id, text: name }] : [];
}

/**
 * Every invitation in two takes.
 *
 * `solo`  -- the whole line, no name in it. Used when we hold no recording of
 *            the child's chosen name.
 * `after` -- the same line written to follow a spoken name, so the name can be
 *            its own recorded clip at the FRONT. Never mid-sentence.
 *
 * Both end unfinished, on a slight rise, because a word is spoken straight
 * after them.
 */
export const ASK = {
  GAP:    { solo: "There's a gap here. Can you say",        after: 'needs a way across. Can you say' },
  REACH:  { solo: "That's too high up. Can you say",        after: "can't reach it. Can you say" },
  DARK:   { solo: "It's dark in there. We need",            after: 'needs a light. Can you say' },
  HIDDEN: { solo: "Someone's hiding! Is it a",              after: 'found something. Is it a' },
  CLOSED: { solo: "This door won't open. We need",          after: 'needs to get through. Can you say' },
  CARRY:  { solo: "It's too heavy to lift. Can you say",    after: "can't carry it. Can you say" },
};

export const CHROME = {
  where:     { id: 'chrome-where', text: 'Tap a picture.' },
  tryAgain:  { id: 'chrome-try', text: "Let's say it together." },
  sleepy:    { id: 'chrome-sleepy', text: 'The light is going down. Time to say goodnight.' },
  goodnight: { id: 'chrome-goodnight', text: 'Goodnight! See you next time.' },
  wake:      { id: 'chrome-wake', text: 'Can you say' },
  whoFirst:  { id: 'chrome-who', text: 'Pick a friend.' },
  nameFirst: { id: 'chrome-name', text: 'Pick a name.' },
};

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
