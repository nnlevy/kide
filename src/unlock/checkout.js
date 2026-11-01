import { DOMAIN, OFFERING_ID, STRIPE_PRICE_ID } from "./config.js";

// The hub returns a URL. Only an https URL is handed back to the browser.
export function httpsUrl(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 2000) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/**
 * Fields the billing hub already reads for the clinician licence, plus the
 * placeholder price id. The offering is fixed here. The browser cannot swap it.
 */
export function checkoutInput({ origin, email }) {
  return {
    domain: DOMAIN,
    offeringId: OFFERING_ID,
    priceId: STRIPE_PRICE_ID,
    email,
    successUrl: `${origin}/unlock/?checkout=success&email=${encodeURIComponent(email)}`,
    cancelUrl: `${origin}/play/`,
    sourceDomain: DOMAIN,
  };
}
