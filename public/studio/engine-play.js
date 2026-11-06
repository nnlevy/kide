// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Walks an approved lesson through LessonEngine.submitAttempt.
// The words page owns scene and voice. This file does not tap-list.

import { LessonEngine, LEX, STATIONS } from "../engine/engine.js";
import { validateLesson } from "./schema.js";

export function scriptFromLesson(lesson, { companionName = "Pip" } = {}) {
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
  const name = typeof companionName === "string" && companionName.trim()
    ? companionName.trim().slice(0, 24)
    : "Pip";
  const beats = checked.lesson.beats.map((beat, i) => {
    const word = LEX.find((w) => w.w === beat.word && w.aff.includes(beat.affordance));
    const station = STATIONS[beat.affordance];
    return {
      target: { ph: word.ph, pos: word.pos, a: 1, b: 1, lvl: word.lvl, lastBeat: -99, n: 0 },
      word,
      affordance: beat.affordance,
      station,
      beat: i,
      invitation: station.ask(name, word.w),
    };
  });
  return { lesson: checked.lesson, companionName: name, beats };
}

export function attachScript(engine, script) {
  if (!(engine instanceof LessonEngine)) throw new Error("engine");
  engine.studioScript = script.beats;
  engine.studioIndex = 0;
  engine.companionName = script.companionName;
  engine.current = script.beats[0];
  engine.attempt = 0;
  return engine.current;
}

export function nextScriptBeat(engine) {
  if (!engine || !engine.studioScript) return { done: true };
  engine.studioIndex += 1;
  engine.attempt = 0;
  if (engine.studioIndex >= engine.studioScript.length) {
    engine.current = null;
    return { done: true };
  }
  engine.current = engine.studioScript[engine.studioIndex];
  return { done: false, beat: engine.current };
}
