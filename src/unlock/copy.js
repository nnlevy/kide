// Sentences a parent or a child can read. No ops words, no status claims.

export const COPY = {
  needEmail: "Enter the email you want on the receipt.",
  retry: "Pip could not open checkout. Try again in a moment.",
  holdMismatch: "That does not match. Try another answer.",
  notHere: "Open family play from Pip.",
  method: "Open family play from Pip.",
  stillOnTheWay: "The receipt is still on its way.",
  keepPlaying: "This email can keep playing with Pip.",
};

const BANNED = [
  /\bcurrently\b/i,
  /\bfastest\b/i,
  /\bbest\b/i,
  /\bleading\b/i,
  /\bavailable\b/i,
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bwebhook\b/i,
  /\bstripe\b/i,
];

export function readable(text) {
  return typeof text === "string" && text.length > 0 && !BANNED.some((re) => re.test(text));
}
