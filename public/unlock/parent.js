// Money path: visit → tool use → signup → paid step → Stripe.
// Grown-up hold, then the existing checkout. The price stays behind the hold.

import { ENTITLEMENT_WAIT_MS, answerMatches, makeHold, nextPoll } from "./gate.js";

const $ = (id) => document.getElementById(id);

const COPY = {
  mismatch: "That does not match. Try another answer.",
  needEmail: "Enter the email you want on the receipt.",
  soon: "Family play is opening soon. We'll email you.",
  checking: "Checking the receipt.",
  keep: "This email can keep playing with Pip.",
  waiting: "The receipt is still on its way. Return to Pip. This page can check again.",
};

function show(id) {
  for (const panel of ["hold", "pay", "wait"]) {
    const el = $(panel);
    if (!el) continue;
    if (panel === id) el.hidden = false;
    else el.hidden = true;
  }
}

function say(id, text) {
  const el = $(id);
  if (el) el.textContent = text || "";
}

function passed() {
  try { return sessionStorage.getItem("kide.grownup") === "1"; }
  catch { return false; }
}

function markPassed() {
  try { sessionStorage.setItem("kide.grownup", "1"); }
  catch { /* the hold still stands for this view */ }
}

let hold = null;

function armHold() {
  hold = makeHold();
  say("prompt", hold.prompt);
  const input = $("answer");
  if (input) input.value = "";
  say("holdMsg", "");
  show("hold");
}

function revealPay() {
  markPassed();
  show("pay");
  const email = $("email");
  if (email) email.focus();
}

async function prefill() {
  try {
    const res = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" });
    const data = await res.json();
    const email = $("email");
    if (email && !email.value && data && data.signedIn === true && typeof data.email === "string") {
      email.value = data.email;
    }
  } catch { /* sign-in is a choice on this page */ }
}

function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function rememberParent(address) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: address,
        matchedDomain: "kide",
        matchedTitle: "Kide — family play",
        need: "Email me when family play opens",
        pageUrl: location.origin + location.pathname,
      }),
    });
  } catch {
    // The sentence on the page is the whole reply.
  }
}

async function startCheckout(event) {
  event.preventDefault();
  const email = $("email");
  const address = email ? email.value.trim() : "";
  if (!address.includes("@") || address.length > 254) {
    say("payMsg", COPY.needEmail);
    if (email) email.focus();
    return;
  }
  const button = $("payGo");
  if (button) button.disabled = true;
  say("payMsg", "");
  let url = null;
  try {
    const res = await fetch("/api/unlock/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.ok === true) url = safeCheckoutUrl(data.url);
  } catch {
    url = null;
  }
  if (url) {
    location.href = url;
    return;
  }
  say("payMsg", COPY.soon);
  await rememberParent(address);
  if (button) button.disabled = false;
}

async function confirmLoop(address) {
  show("wait");
  say("waitMsg", COPY.checking);
  const started = Date.now();
  async function step() {
    let result = null;
    try {
      const res = await fetch("/api/unlock/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      result = await res.json();
    } catch {
      result = null;
    }
    const next = nextPoll({ started, now: Date.now(), budget: ENTITLEMENT_WAIT_MS }, result);
    if (!next.done) {
      setTimeout(step, next.waitMs);
      return;
    }
    say("waitMsg", next.unlocked ? COPY.keep : COPY.waiting);
  }
  step();
}

function boot() {
  const params = new URLSearchParams(location.search);
  const back = params.get("checkout");
  if (back === "success") {
    const address = params.get("email") || "";
    confirmLoop(address);
    return;
  }
  if (passed()) {
    show("pay");
    prefill();
  } else {
    armHold();
  }

  const check = $("check");
  if (check) {
    check.addEventListener("click", () => {
      const answer = $("answer");
      if (answerMatches(hold, answer && answer.value)) revealPay();
      else {
        say("holdMsg", COPY.mismatch);
        if (answer) answer.focus();
      }
    });
  }
  const answer = $("answer");
  if (answer) {
    answer.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("check").click();
      }
    });
  }
  const form = $("payForm");
  if (form) form.addEventListener("submit", startCheckout);
  if (!hold || passed()) prefill();
}

boot();
