// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Approved lessons play through LessonEngine. The tap-list helper is gone.

export { attachScript, nextScriptBeat, scriptFromLesson } from "./engine-play.js";
export { MAX_ATTEMPTS, STATE } from "../engine/engine.js";
