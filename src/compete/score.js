// Points for challenge mode.
//
// Money path: free Pip practice (tool use) → https://kide.us/pricing → /clinician/
// ($39 licence). No new price.
//
// The clock that matters is the one on this side. A number sent from the
// browser is never a score. A reply quicker than a person can move earns
// nothing, and that question cannot be answered again more slowly.

export const MIN_HUMAN_MS = 350;
export const ARRIVAL_GRACE_MS = 800;
export const START_TIER = 3;
export const MAX_TIER = 5;
export const WINDOW_MS = 10 * 60 * 1000;
export const WINDOW_MAX = 40;
export const BOARD_CAP = 20;

const ACCOUNT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function validAccountId(id) {
  return typeof id === "string" && ACCOUNT_ID.test(id);
}

export function validPlayerId(id) {
  return typeof id === "string" && /^[a-z0-9]{16,40}$/.test(id);
}

export function validQuestionId(id) {
  return typeof id === "string" && /^[a-z0-9]{8,24}$/.test(id);
}

function clampInt(n, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(x, max);
}

export function tierForStreak(streak) {
  const steps = Math.floor(clampInt(streak, 1000) / 3);
  return Math.min(MAX_TIER, START_TIER + steps);
}

export function limitForTier(tier) {
  if (tier >= 5) return 6000;
  if (tier >= 4) return 7500;
  return 9000;
}

/**
 * Base points grow with the tier. A speed bonus fills in whatever part of
 * the window was left. A longer run multiplies, and then stops climbing.
 */
export function pointsFor(tier, elapsed, limitMs, streak) {
  const t = Math.min(MAX_TIER, Math.max(1, clampInt(tier, 9) || 1));
  const limit = Math.max(1, Number(limitMs) || 1);
  const spent = Math.max(0, Math.min(limit, Number(elapsed) || 0));
  const base = 10 * t;
  const speed = Math.round(((limit - spent) / limit) * 8 * t);
  const mult = 1 + Math.min(Math.max(clampInt(streak, 100) - 1, 0), 5) * 0.25;
  return Math.max(1, Math.round((base + speed) * mult));
}

/**
 * `now` and `issuedAt` are both this side's clock.
 * A reused question, a clock that runs backwards, or a reply quicker than
 * a person can move is not scored.
 */
export function judge({ issuedAt, now, limitMs, used, choice, answer, tier, streak }) {
  const blank = { accepted: false, correct: false, points: 0, streak: 0, consume: false };
  if (used) return blank;
  if (typeof now !== "number" || typeof issuedAt !== "number" || now < issuedAt) {
    return { ...blank, consume: true };
  }
  const elapsed = now - issuedAt;
  if (elapsed < MIN_HUMAN_MS) return { ...blank, consume: true };
  const gaveUp = choice == null || choice === "";
  const late = elapsed > limitMs + ARRIVAL_GRACE_MS;
  if (gaveUp || late || typeof choice !== "string" || choice !== answer) {
    return { accepted: true, correct: false, points: 0, streak: 0, consume: true };
  }
  const next = clampInt(streak, 1000) + 1;
  return {
    accepted: true,
    correct: true,
    points: pointsFor(tier, elapsed, limitMs, next),
    streak: next,
    consume: true,
  };
}

export function cleanHandle(raw) {
  const s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 16) {
    return { ok: false, message: "Pick a nickname of 2 to 16 letters." };
  }
  if (/@/.test(s) || /[.]/.test(s) || /https?:/i.test(s) || /[/\\]/.test(s)) {
    return { ok: false, message: "A nickname, not an email or a link." };
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 7) return { ok: false, message: "A nickname, not a phone number." };
  if (/^\d+$/.test(s)) return { ok: false, message: "Add a word beside the numbers." };
  if (!/^[\p{L}\p{N} ]+$/u.test(s)) {
    return { ok: false, message: "Letters, numbers, and spaces." };
  }
  return { ok: true, handle: s };
}

/** ISO week, UTC. */
export function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

export function defaultRng() {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  };
}

export function randomId(rng) {
  let s = "";
  for (let i = 0; i < 18; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}
