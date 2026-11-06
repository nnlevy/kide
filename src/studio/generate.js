// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// PORTFOLIO_AI_SERVICE proposes JSON. The prompt is age band + skill gaps
// and lexicon words. A parent note is screened elsewhere and is not an argument.

import { buildModelInput, parseModelJson, validateLesson } from "../../public/studio/schema.js";

export async function proposeLesson(ai, { ageBand, skillGaps }) {
  const input = buildModelInput({ ageBand, skillGaps });
  if (!ai || typeof ai.createChatCompletion !== "function") {
    return { ok: false, error: "ai_unavailable" };
  }
  let out;
  try {
    out = await ai.createChatCompletion(input);
  } catch {
    return { ok: false, error: "ai_unavailable" };
  }
  if (!out || out.ok === false) return { ok: false, error: "ai_unavailable" };
  const choice = out.data && out.data.choices && out.data.choices[0];
  const content = choice && choice.message && choice.message.content;
  const parsed = parseModelJson(content);
  if (!parsed) return { ok: false, error: "invalid_lesson" };
  const validated = validateLesson(parsed, { ageBand, skillGaps });
  if (!validated.ok) return { ok: false, error: "invalid_lesson" };
  return { ok: true, lesson: validated.lesson };
}
