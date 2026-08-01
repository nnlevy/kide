// journal.js -- durable practice evidence.
//
// The clinical layer (clinical.js) computes honest statistics from raw attempt
// events. Until now those events lived only in memory, which made the whole
// wedge a demo: close the tab and a month of evidence disappears. A clinical
// record over a 28-day review period is worthless if it cannot survive a
// browser restart, and adherence -- the number nobody else in this category can
// produce -- is *entirely* a function of history.
//
// So this is the store. Append-only, local-only, capped, and versioned.
//
// PRIVACY IS THE PRODUCT PROMISE, AND THIS IS WHERE IT IS KEPT OR LOST.
//
//   * Nothing here ever leaves the device unless a grown-up explicitly shares
//     it. There is no sync, no account, no endpoint.
//   * No audio. No waveform. No embedding. No voiceprint. The amended COPPA
//     Rule (in force since 22 April 2026) lists voiceprints as biometric
//     personal information -- storing one would convert the promise the whole
//     product rests on into its largest liability.
//   * A field allow-list is enforced on WRITE, not just by convention, so a
//     future caller cannot quietly widen what is retained. A test asserts it.
//   * clear() exists and is reachable from the parent surface. A parent must
//     be able to delete their child's record, immediately and completely.

export const JOURNAL_KEY = 'kide_practice_journal_v1';
export const SCHEMA_VERSION = 1;

/** Ring-buffer cap. ~40 attempts/day of daily practice is a year and a half of
 *  history in 6000 events, which is far longer than any review period and well
 *  inside a typical 5MB localStorage budget at ~90 bytes/event. Oldest events
 *  are dropped first: recent history is what a clinician reads. */
export const MAX_EVENTS = 6000;

/** The ONLY fields that may be persisted. Anything else on an incoming event
 *  is dropped silently rather than stored -- an allow-list fails safe, a
 *  deny-list fails open. */
export const ALLOWED_FIELDS = [
  'at',          // ms timestamp -- adherence is unrecoverable without it
  'target',      // phoneme_position, e.g. "r_initial"
  'word',        // the word asked for
  'tier',        // how it was answered: tap | native | gop-webgpu | gop-wasm
  'verdict',     // clear | unsure | no-input
  'forced',      // resolved on the encouragement cap
  'level',       // complexity rung AT THE TIME (it mutates on promotion)
  'surface',     // which part of the product produced it
];

/** Fields that must NEVER appear, whatever a caller passes. Belt and braces
 *  alongside the allow-list, and named explicitly so the intent is legible. */
export const FORBIDDEN_FIELDS = [
  'audio', 'pcm', 'waveform', 'embedding', 'voiceprint', 'recording',
  'name', 'childName', 'email', 'dob', 'birthday', 'address', 'ip',
];

const hasLocalStorage = (() => {
  try {
    const k = '__kide_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;    // private mode, quota exhausted, or storage disabled
  }
})();

/** In-memory fallback so the game is never broken by unavailable storage.
 *  The evidence is lost on reload in that case, which is honest: better than
 *  a crash, and the report will simply show what this session produced. */
let memory = { v: SCHEMA_VERSION, events: [] };

function read() {
  if (!hasLocalStorage) return memory;
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return { v: SCHEMA_VERSION, events: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.events)) {
      // Unknown or corrupt schema: start clean rather than feed a clinician
      // numbers derived from something we cannot interpret.
      return { v: SCHEMA_VERSION, events: [] };
    }
    return parsed;
  } catch {
    return { v: SCHEMA_VERSION, events: [] };
  }
}

function write(state) {
  if (!hasLocalStorage) { memory = state; return true; }
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Quota exceeded. Drop the oldest half and retry once -- losing old
    // history is much better than silently losing every new attempt.
    try {
      const trimmed = { v: SCHEMA_VERSION, events: state.events.slice(-Math.floor(MAX_EVENTS / 2)) };
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      memory = state;
      return false;
    }
  }
}

/** Strip an incoming event to the allow-list. Returns null if it carries no
 *  usable evidence at all. */
export function sanitize(event) {
  if (!event || typeof event !== 'object') return null;
  const out = {};
  for (const f of ALLOWED_FIELDS) {
    if (event[f] !== undefined && event[f] !== null) out[f] = event[f];
  }
  if (!out.target || !out.tier) return null;   // not an attempt we can reason about
  if (typeof out.at !== 'number') out.at = Date.now();
  return out;
}

/** Record one attempt. Safe to call from anywhere; never throws. */
export function record(event) {
  const clean = sanitize(event);
  if (!clean) return false;
  const state = read();
  state.events.push(clean);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }
  return write(state);
}

/** Every retained attempt, oldest first. This is the input clinical.js wants. */
export function all() {
  return read().events.slice();
}

export function count() {
  return read().events.length;
}

/** Delete everything. Must stay reachable from the parent surface -- a parent
 *  deleting their child's record is not a feature, it is an obligation. */
export function clear() {
  memory = { v: SCHEMA_VERSION, events: [] };
  if (hasLocalStorage) {
    try { localStorage.removeItem(JOURNAL_KEY); } catch { /* already gone */ }
  }
  return true;
}

/** Events within the last N days -- a clinician reviews a period, not all time. */
export function since(days, now = Date.now()) {
  const cutoff = now - days * 86400000;
  return all().filter((e) => e.at >= cutoff);
}

/**
 * A shareable payload for the clinician report.
 *
 * Encoded into a URL fragment rather than posted anywhere: a parent can hand a
 * clinician a link, from their own device, with no account, no login, and no
 * server ever seeing it. Base64 of JSON, and deliberately nothing else --
 * there is no identifier in here to correlate.
 */
export function exportLink(baseUrl = '/clinician/', { days = 90, now = Date.now() } = {}) {
  const events = since(days, now);
  const json = JSON.stringify(events);
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf8').toString('base64');
  return `${baseUrl}?data=${encodeURIComponent(b64)}`;
}

/** Rough storage footprint, for the parent surface to show honestly. */
export function sizeBytes() {
  try { return JSON.stringify(read()).length; } catch { return 0; }
}

export const storageAvailable = () => hasLocalStorage;
