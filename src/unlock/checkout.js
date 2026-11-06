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
 * live family price id. The offering is fixed here. The browser cannot swap it.
 */
export function checkoutInput({ origin, email, ref }) {
  const input = {
    domain: DOMAIN,
    offeringId: OFFERING_ID,
    priceId: STRIPE_PRICE_ID,
    email,
    successUrl: `${origin}/unlock/?checkout=success&sid={CHECKOUT_SESSION_ID}`,
    // Backing out of Stripe returns to Pip. The play page reads checkout=cancel
    // and tells the grown-up no charge was made.
    cancelUrl: `${origin}/play/?checkout=cancel`,
    sourceDomain: DOMAIN,
  };
  // The hub copies customMetadata to Stripe as metadata[custom_ref] and credits
  // the sharer only after a PAID webhook. A missing or bad code changes nothing.
  if (typeof ref === "string" && /^[2-9A-HJKMNP-TV-Z]{8}$/.test(ref)) input.customMetadata = { ref };
  return input;
}
