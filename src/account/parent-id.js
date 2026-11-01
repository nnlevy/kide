// Money path: visit → tool use → signup → credits / paid step → Stripe.
// A stable parent id for the unlock and leaderboard. It is not the email
// and not the phone. The same address always maps to the same id.

export async function parentIdFor(kind, value) {
  const data = new TextEncoder().encode(`kide.us\n${kind}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `p_${hex.slice(0, 32)}`;
}

export function isParentId(value) {
  return typeof value === "string" && /^p_[a-f0-9]{32}$/.test(value);
}
