// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Plays a validated lesson with the engine's beat shape. No failure state.
// A forced ending is the same triumph as a clear try. Nothing here is a score.

import { MAX_ATTEMPTS, STATE } from "../engine/engine.js";
import { LEX, STATIONS } from "../engine/lexicon.js";
import { validateLesson } from "./schema.js";

export { MAX_ATTEMPTS, STATE };

/**
 * @param {object} lesson validated lesson JSON
 * @param {{ companionName?: string }} [opts] companion only — never a child's name
 */
export function startPlay(lesson, { companionName = "Pip" } = {}) {
  const checked = validateLesson(lesson && {
    version: lesson.version,
    title: lesson.title,
    ageBand: lesson.ageBand,
    skillGaps: lesson.skillGaps,
    beats: lesson.beats,
  });
  if (!checked.ok) {
    const err = new Error("lesson");
    err.errors = checked.errors;
    throw err;
  }
  const name = typeof companionName === "string" && companionName.trim() ? companionName.trim().slice(0, 24) : "Pip";
  return {
    companionName: name,
    lesson: checked.lesson,
    beats: checked.lesson.beats.map((beat, i) => materialize(beat, name, i)),
    index: 0,
    attempt: 0,
    done: false,
    resolved: [],
  };
}

export function currentBeat(run) {
  if (!run || run.done) return null;
  return run.beats[run.index] || null;
}

/**
 * said=true finishes the beat in triumph.
 * said=false is a warm re-invite. At MAX_ATTEMPTS the beat still triumphs.
 * The return value never carries a score.
 */
export function hear(run, said) {
  if (!run || run.done) return { state: "DONE", done: true };
  const beat = run.beats[run.index];
  if (said) return advance(run, beat);
  run.attempt += 1;
  if (run.attempt >= MAX_ATTEMPTS) return advance(run, beat);
  return { state: STATE.MODEL, done: false, invitation: beat.invitation };
}

function advance(run, beat) {
  run.resolved.push({ word: beat.word.w, state: STATE.TRIUMPH });
  run.index += 1;
  run.attempt = 0;
  if (run.index >= run.beats.length) run.done = true;
  return { state: STATE.TRIUMPH, done: run.done };
}

function materialize(beat, companionName, i) {
  const word = LEX.find((w) => w.w === beat.word && w.aff.includes(beat.affordance));
  const station = STATIONS[beat.affordance];
  return {
    target: { ph: word.ph, pos: word.pos },
    word,
    affordance: beat.affordance,
    station: { id: station.id, name: station.name },
    beat: i,
    state: STATE.ASK,
    invitation: station.ask(companionName, word.w),
  };
}
