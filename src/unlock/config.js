// Money path: visit → tool use (Pip play) → signup → paid step → Stripe.
// The paid step is the existing portfolio checkout (createCheckout / getCredits).
// price_1UWqYjIzTeKgjbPrOtu7jVAG is the live $15 one-time price on product
// prod_VXwRuRo0HAZXKh. This file has no secret key and must not gain one.
// The hub does not read this id off the RPC input. It charges the price named
// by STRIPE_PRICE_ID_KIDE_US_FAMILY_UNLOCK on the riskfreetrial worker, after
// family_unlock is in that worker's kide.us catalog.

export const DOMAIN = "kide.us";
export const OFFERING_ID = "family_unlock";
export const STRIPE_PRODUCT_ID = "prod_VXwRuRo0HAZXKh";

// Live Stripe price. Checkout still goes through PORTFOLIO_BILLING_SERVICE.
export const STRIPE_PRICE_ID = "price_1UWqYjIzTeKgjbPrOtu7jVAG";

export const AMOUNT_CENTS = 1500;
export const AMOUNT_LABEL = "$15";

// Free play before Pip asks for a grown-up. Per device and per parent, per day.
export const FREE_PLAY_MINUTES = 5;
export const COUNTDOWN_SECONDS = 10;

// A hidden tab must not dump a long gap into the day count in one tick.
export const MAX_TICK_SECONDS = 20;

// After checkout, poll purchase history this long for the hub webhook.
export const ENTITLEMENT_WAIT_MS = 10000;
