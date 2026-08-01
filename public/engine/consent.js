// consent.js -- one microphone, one permission.
//
// voice.js already owns a versioned consent record for the quiz game. This
// module reads and writes THE SAME RECORD rather than introducing a second
// one, and that is a deliberate compliance decision, not a convenience:
//
//   * A parent who has already allowed the microphone in Pip's garden must not
//     be asked again in the word practice. Being asked twice for the same
//     thing teaches a parent that the prompt is meaningless, which is exactly
//     how consent stops being consent.
//   * More importantly, REVOKE has to be total. If two surfaces kept separate
//     records, a parent who withdrew permission in one place would still have
//     a live microphone in the other -- and they would have no way of knowing.
//     One record means one off switch.
//
// The schema is voice.js's; this file must stay compatible with it. The
// version field exists so that a change in what is being consented to forces a
// fresh ask rather than silently inheriting an old yes.

/** Must match voice.js exactly. */
export const CONSENT_KEY = 'kide_voice_consent_v1';
export const CONSENT_VERSION = 1;

function read() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * The current consent, or null.
 *
 * Returns null for a stale version on purpose: if the policy changed, the old
 * yes was to a different question.
 */
export function get() {
  const c = read();
  if (!c || !c.granted) return null;
  if (c.version !== CONSENT_VERSION) return null;
  return c;
}

export const granted = () => !!get();

/** `mode` records WHAT was agreed to. Only on-device modes exist -- there is
 *  no cloud path in this product, and this field is here so that if one were
 *  ever added it could not inherit an on-device yes. */
export function grant(mode = 'ondevice') {
  const c = { granted: true, version: CONSENT_VERSION, mode, at: Date.now() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch { /* private mode */ }
  // Keep the quiz game in step if it happens to be loaded on this page.
  try { globalThis.KideVoice?.consent?.grant?.(mode); } catch { /* not loaded */ }
  return c;
}

/** Withdraw. Also tells voice.js to stop listening immediately if it is here --
 *  a revoke that leaves a live recogniser running is not a revoke. */
export function revoke() {
  try { localStorage.removeItem(CONSENT_KEY); } catch { /* nothing to remove */ }
  try { globalThis.KideVoice?.consent?.revoke?.(); } catch { /* not loaded */ }
  return true;
}
