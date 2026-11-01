// Money path: visit → tool use (Pip play) → signup → paid step → Stripe.
// The paid step is the existing portfolio checkout (createCheckout / getCredits).
// The Stripe price id is a placeholder until Nir adds family_unlock to the hub
// catalog. This file has no secret key and must not gain one.

export const DOMAIN = "kide.us";
export const OFFERING_ID = "family_unlock";

// Not a live Stripe price. Checkout still goes through PORTFOLIO_BILLING_SERVICE.
export const STRIPE_PRICE_ID = "price_PLACEHOLDER_FAMILY_UNLOCK";

export const AMOUNT_CENTS = 1500;
export const AMOUNT_LABEL = "$15";

// Free play before Pip asks for a grown-up. Per device and per parent, per day.
export const FREE_PLAY_MINUTES = 5;
export const COUNTDOWN_SECONDS = 10;

// A hidden tab must not dump a long gap into the day count in one tick.
export const MAX_TICK_SECONDS = 20;

// After checkout, poll purchase history this long for the hub webhook.
export const ENTITLEMENT_WAIT_MS = 10000;
