// Money path: visit → tool use → signup → credits / paid step → Stripe.
// This chooses how a parent signs up. Email is the channel. SMS is the same
// PortfolioMessagingService call once riskfreetrial has a from-number.
// Provider secrets stay on that worker. Nothing in this file is a key.

export const DOMAIN = "kide.us";

// Bump when the consent sentence changes. The messaging service stores it.
export const SMS_CONSENT_VERSION = "kide-otp-1";

// Express written consent for a sign-in text. No price, no ranking, no status.
export function consentText() {
  return "Kide will text a sign-in code to this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help.";
}

// "sms" is the only switch. Anything else, including unset, stays on email.
// KIDE_LOGIN_CHANNEL is a plain env binding, not a secret.
export function loginChannel(env) {
  const raw = env && typeof env.KIDE_LOGIN_CHANNEL === "string" ? env.KIDE_LOGIN_CHANNEL.trim().toLowerCase() : "";
  return raw === "sms" ? "sms" : "email";
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, "");
  if (email.length < 3 || email.length > 254) return null;
  if (email.startsWith(".") || email.includes("..") || email.includes("@.") || email.includes(".@")) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
  return email;
}

// US numbers only, E.164. The messaging service applies the same check again.
export function toE164(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return null;
  let digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.length === 10) {
    digits = `1${digits}`;
  }
  if (!/^1[2-9]\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}
