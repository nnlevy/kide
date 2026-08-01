// profile.js -- who the child chose, remembered.
//
// Personalisation that does not persist is not personalisation. A child who
// picks a companion and names it, and then finds a stranger waiting the next
// morning, has been told the choice did not matter. For a two-year-old that is
// the whole of the relationship.
//
// So this is deliberately tiny and deliberately durable: companion, name, and
// the parent's stated concern. Nothing else -- and specifically no birthday, no
// age, no identifiers. The name is a first name the child chose for a toy,
// which is as much as the product ever needs to know about them.
//
// Same discipline as journal.js: local only, allow-listed on write, and
// clearable by a parent.

export const PROFILE_KEY = 'kide_profile_v1';
export const SCHEMA_VERSION = 1;

/** The only fields that may be stored. */
export const ALLOWED = ['actorId', 'companionName', 'concern', 'startedAt'];

const CONCERNS = ['unclear', 'late', 'reading'];

const canStore = (() => {
  try {
    const k = '__kide_p__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
})();

let memory = null;

export function load() {
  if (!canStore) return memory;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.v !== SCHEMA_VERSION) return null;
    return p.profile || null;
  } catch { return null; }
}

/** Save a choice. Unknown fields are dropped rather than stored. */
export function save(profile) {
  const clean = {};
  for (const f of ALLOWED) {
    if (profile && profile[f] !== undefined && profile[f] !== null) clean[f] = profile[f];
  }
  if (!clean.actorId || !clean.companionName) return false;
  if (!CONCERNS.includes(clean.concern)) clean.concern = 'unclear';
  // A chosen name is free text a child picked. Cap it so a paste accident
  // cannot bloat storage, and strip anything that would break rendering.
  clean.companionName = String(clean.companionName).replace(/[<>]/g, '').trim().slice(0, 24);
  if (!clean.companionName) return false;
  if (!clean.startedAt) clean.startedAt = Date.now();

  memory = clean;
  if (!canStore) return true;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ v: SCHEMA_VERSION, profile: clean }));
    return true;
  } catch { return true; }   // memory still holds it for this session
}

export function clear() {
  memory = null;
  if (canStore) { try { localStorage.removeItem(PROFILE_KEY); } catch { /* gone */ } }
  return true;
}

export const has = () => !!load();
export const storageAvailable = () => canStore;
