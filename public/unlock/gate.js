// Money path: visit → tool use → signup → paid step → Stripe.
// Grown-up hold and the post-checkout wait. No price, no network.

export const ENTITLEMENT_WAIT_MS = 10000;

export function makeHold(rng = Math.random) {
  const roll = () => 12 + Math.floor(rng() * 28);
  const a = roll();
  const b = roll();
  return { a, b, prompt: `What is ${a} + ${b}?`, answer: a + b };
}

export function answerMatches(hold, raw) {
  if (!hold || typeof hold.answer !== "number") return false;
  const text = String(raw == null ? "" : raw).trim();
  if (!/^\d{1,3}$/.test(text)) return false;
  return Number(text) === hold.answer;
}

export function nextPoll(state, result) {
  const started = state.started;
  const now = state.now;
  const budget = state.budget;
  if (result && result.unlocked === true) return { done: true, unlocked: true, waitMs: 0 };
  if (now - started >= budget) return { done: true, unlocked: false, waitMs: 0 };
  return { done: false, unlocked: false, waitMs: 1000 };
}
