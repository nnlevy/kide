// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Checkout stays closed until a live price exists. This file does not name a price.
// A lesson is age band + skill gaps + lexicon words. No child name is a field.

import { LEX, AFFORDANCES, STATIONS, keyOf } from "../engine/lexicon.js";

export const LESSON_VERSION = 1;

/** Oldest band stays on the short words. The cap is the lexicon level, not a score. */
export const AGE_BANDS = {
  "2-3": { maxLvl: 2 },
  "3-4": { maxLvl: 3 },
  "4-5": { maxLvl: 4 },
  "5-7": { maxLvl: 5 },
};

const POS_LABEL = { initial: "at the start", medial: "in the middle", final: "at the end" };

const ALLOWED_BODY = new Set(["ageBand", "skillGaps", "message"]);

const UNSAFE = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b(?:child(?:'|’)s name|my name is|his name is|her name is|named)\b/i,
  /\bmy\s+(?:son|daughter|child|kid|boy|girl)\s+[A-Z][a-z]{2,}/,
  /\b(?:birthday|date of birth|home address|school|diagnos(?:is|ed))\b/i,
  /\b(?:sex|sexual|nude|naked|porn)\b/i,
  /\b(?:kill|murder|weapon|gun|bomb|suicide|self-harm)\b/i,
  /\b(?:ignore (?:all |previous |your )?instructions|jailbreak|system prompt)\b/i,
  /\b(?:ssn|social security)\b/i,
];

const SYSTEM = [
  "You propose one Kide speech-practice lesson as JSON.",
  "You are given an age band and skill gaps only.",
  "Do not invent a person, a name, a school, or a place.",
  "Use only the words listed in the user message.",
  "Return JSON with beats: an array of 4 objects {\"word\",\"affordance\"}.",
  "affordance is one of GAP, REACH, DARK, HIDDEN, CLOSED, CARRY and must be one that word allows.",
].join(" ");

export function gapLabel(key) {
  const [ph, pos] = String(key).split("_");
  return `${ph} ${POS_LABEL[pos] || pos}`;
}

export function skillGapCatalog() {
  const seen = new Set();
  const out = [];
  for (const row of LEX) {
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: gapLabel(key) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

const SKILL_GAP_SET = new Set(skillGapCatalog().map((g) => g.key));

export function titleFor(skillGaps) {
  const labels = skillGaps.map(gapLabel);
  if (labels.length === 1) return `Practice ${labels[0]}`;
  return `Practice ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function unsafeText(text) {
  return UNSAFE.some((re) => re.test(text));
}

/**
 * The chat body may carry a short note so an unsafe request can be refused.
 * The note is never returned. Callers must not pass it to the model.
 */
export function screenChat(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "bad_request" };
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY.has(key)) return { ok: false, error: "refused" };
  }
  if (Object.prototype.hasOwnProperty.call(body, "message")) {
    if (typeof body.message !== "string") return { ok: false, error: "refused" };
    const message = body.message.normalize("NFC").trim();
    if (message.length > 400) return { ok: false, error: "refused" };
    if (message && unsafeText(message)) return { ok: false, error: "refused" };
  }
  if (typeof body.ageBand !== "string" || !AGE_BANDS[body.ageBand]) {
    return { ok: false, error: "bad_request" };
  }
  if (!Array.isArray(body.skillGaps) || body.skillGaps.length < 1 || body.skillGaps.length > 4) {
    return { ok: false, error: "bad_request" };
  }
  const gaps = [];
  for (const gap of body.skillGaps) {
    if (typeof gap !== "string" || !SKILL_GAP_SET.has(gap) || gaps.includes(gap)) {
      return { ok: false, error: "bad_request" };
    }
    gaps.push(gap);
  }
  return { ok: true, ageBand: body.ageBand, skillGaps: gaps };
}

export function wordsForPrompt(ageBand, skillGaps) {
  const maxLvl = AGE_BANDS[ageBand].maxLvl;
  const out = [];
  const seen = new Set();
  for (const gap of skillGaps) {
    for (const row of LEX) {
      if (keyOf(row) !== gap || row.lvl > maxLvl) continue;
      if (seen.has(row.w)) continue;
      seen.add(row.w);
      out.push(row);
      if (out.filter((w) => keyOf(w) === gap).length >= 6) break;
    }
  }
  return out;
}

/** Model input is the age band, the skill gaps, and lexicon words. Nothing else. */
export function buildModelInput({ ageBand, skillGaps }) {
  const words = wordsForPrompt(ageBand, skillGaps);
  const lines = words.map((w) => `${w.w} | ${w.aff.join(",")} | L${w.lvl}`).join("\n");
  const user = `Age band: ${ageBand}\nSkill gaps: ${skillGaps.join(", ")}\nWords:\n${lines}`;
  return {
    domain: "kide.us",
    purpose: "lesson_studio",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  };
}

export function parseModelJson(content) {
  if (typeof content !== "string") return null;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fail(errors) {
  return { ok: false, errors };
}

/**
 * @param {object} input model JSON, or an already stored lesson
 * @param {{ ageBand?: string, skillGaps?: string[] }} [locked] request values win over the model
 */
export function validateLesson(input, locked = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(["lesson"]);
  const topAllowed = new Set(["version", "title", "ageBand", "skillGaps", "beats"]);
  for (const key of Object.keys(input)) {
    if (!topAllowed.has(key)) return fail(["unexpected"]);
  }
  const ageBand = locked.ageBand || input.ageBand;
  const skillGaps = locked.skillGaps || input.skillGaps;
  if (typeof ageBand !== "string" || !AGE_BANDS[ageBand]) return fail(["ageBand"]);
  if (!Array.isArray(skillGaps) || skillGaps.length < 1 || skillGaps.length > 4) return fail(["skillGaps"]);
  for (const gap of skillGaps) {
    if (typeof gap !== "string" || !SKILL_GAP_SET.has(gap)) return fail(["skillGaps"]);
  }
  if (new Set(skillGaps).size !== skillGaps.length) return fail(["skillGaps"]);
  if (!Array.isArray(input.beats) || input.beats.length < 3 || input.beats.length > 6) return fail(["beats"]);

  const maxLvl = AGE_BANDS[ageBand].maxLvl;
  const beats = [];
  const used = new Set();
  for (const beat of input.beats) {
    const resolved = resolveBeat(beat, skillGaps, maxLvl);
    if (!resolved) return fail(["beat"]);
    if (used.has(resolved.word)) return fail(["repeat"]);
    used.add(resolved.word);
    beats.push(resolved);
  }
  return {
    ok: true,
    lesson: {
      version: LESSON_VERSION,
      title: titleFor(skillGaps),
      ageBand,
      skillGaps: skillGaps.slice(),
      beats,
    },
  };
}

function resolveBeat(beat, skillGaps, maxLvl) {
  if (!beat || typeof beat !== "object" || Array.isArray(beat)) return null;
  const allowed = new Set(["word", "affordance", "ph", "pos", "lvl", "station"]);
  for (const key of Object.keys(beat)) {
    if (!allowed.has(key)) return null;
  }
  if (typeof beat.word !== "string" || typeof beat.affordance !== "string") return null;
  if (!AFFORDANCES.includes(beat.affordance)) return null;
  const row = LEX.find((w) =>
    w.w === beat.word
    && w.aff.includes(beat.affordance)
    && skillGaps.includes(keyOf(w))
    && w.lvl <= maxLvl);
  if (!row) return null;
  return {
    word: row.w,
    affordance: beat.affordance,
    ph: row.ph,
    pos: row.pos,
    lvl: row.lvl,
    station: STATIONS[beat.affordance].name,
  };
}
