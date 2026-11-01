// Time-to-correct for ordinary play.
//
// A sample is the gap between a question appearing and a correct answer.
// The rolling median is kept per skill. Anonymous play keeps this on the
// device. An account id, when one exists, is a tag for a later sync.

export const FAST_MIN_ITEMS = 10;
export const SAMPLE_WINDOW = 40;
export const MIN_SAMPLE_MS = 80;
export const MAX_SAMPLE_MS = 120000;

export const SKILLS = {
  colors: true,
  counting: true,
  shapes: true,
  letters: true,
  feelings: true,
};

// Product thresholds for "this hand is quick", by the band a grown-up picked.
// They are not a published norm.
export const AGE_BANDS = {
  toddler: { maxMedianMs: 4500 },
  preschool: { maxMedianMs: 2500 },
  early: { maxMedianMs: 1800 },
};

const ACCOUNT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function validAccountId(id) {
  return typeof id === "string" && ACCOUNT_ID.test(id);
}

export function emptyState() {
  return { bySkill: {} };
}

export function latencyOf(event) {
  if (!event || event.correct !== true) return null;
  const shown = Number(event.shown_at);
  const answered = Number(event.answered_at);
  if (!Number.isFinite(shown) || !Number.isFinite(answered)) return null;
  const ms = Math.round(answered - shown);
  if (ms < MIN_SAMPLE_MS || ms > MAX_SAMPLE_MS) return null;
  return ms;
}

export function median(values) {
  const xs = (Array.isArray(values) ? values : []).filter((n) => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  const sorted = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function cleanSkillList(list) {
  return (Array.isArray(list) ? list : [])
    .filter((n) => typeof n === "number" && n >= MIN_SAMPLE_MS && n <= MAX_SAMPLE_MS)
    .slice(-SAMPLE_WINDOW);
}

export function noteEvent(state, event) {
  const bySkill = {};
  const src = state && state.bySkill && typeof state.bySkill === "object" ? state.bySkill : {};
  for (const key of Object.keys(src)) {
    if (!SKILLS[key]) continue;
    bySkill[key] = cleanSkillList(src[key]);
  }
  const skill = event && SKILLS[event.skill] ? event.skill : "";
  const ms = latencyOf(event);
  if (skill && ms != null) {
    const prev = bySkill[skill] || [];
    const next = prev.concat([ms]);
    bySkill[skill] = next.length > SAMPLE_WINDOW ? next.slice(-SAMPLE_WINDOW) : next;
  }
  return { bySkill };
}

/**
 * Fast when one skill has at least FAST_MIN_ITEMS correct samples and the
 * median of those samples is at or under that age band's line.
 */
export function isConsistentlyFast(state, ageBand) {
  const band = AGE_BANDS[ageBand] || AGE_BANDS.preschool;
  const src = state && state.bySkill ? state.bySkill : {};
  const skills = Object.keys(src);
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    if (!SKILLS[skill]) continue;
    const times = cleanSkillList(src[skill]);
    if (times.length < FAST_MIN_ITEMS) continue;
    const med = median(times);
    if (med != null && med <= band.maxMedianMs) {
      return { fast: true, skill, n: times.length, median: med, ageBand: band === AGE_BANDS[ageBand] ? ageBand : "preschool" };
    }
  }
  return { fast: false, skill: null, n: 0, median: null, ageBand: AGE_BANDS[ageBand] ? ageBand : "preschool" };
}
