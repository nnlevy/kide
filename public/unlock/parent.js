// Money path: visit → tool use → signup → paid step → Stripe.
// Grown-up hold, then the existing checkout. The price stays behind the hold.

import { ENTITLEMENT_WAIT_MS, answerMatches, makeHold, nextPoll } from "./gate.js";

const $ = (id) => document.getElementById(id);

const COPY = {
  mismatch: "That does not match. Try another answer.",
  needEmail: "Enter the email you want on the receipt.",
  retry: "Pip could not open checkout. Try again in a moment.",
  noCharge: "No charge was made. Family play is here whenever you're ready.",
  checking: "Checking the receipt.",
  keep: "This email can keep playing with Pip.",
  waiting: "The receipt is still on its way. Return to Pip. This page can check again.",
  copied: "Copied. Paste it in a text to another parent.",
  shareText: "Pip gets sleepy and asks to be tucked in, so screen time ends without a meltdown. Try it free:",
};

// Funnel steps for this grown-up page. The server adds the share code from
// its own cookie, and marks a QA visit from the cookie it set. See src/funnel.
function funnel(step, detail) {
  try {
    const body = JSON.stringify({ step, detail: detail || "" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }))) return;
    fetch("/api/funnel", { method: "POST", body, keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" } });
  } catch { /* measuring never affects the page */ }
}

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
  try {
    if (new URLSearchParams(location.search).get("checkout") === "back") say("payMsg", COPY.noCharge);
  } catch { /* the offer still shows */ }
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
  funnel("checkout_click");
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
  say("payMsg", COPY.retry);
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
    if (next.unlocked) showShare(address);
  }
  step();
}

// After a paid unlock the grown-up is still here: offer the family's own link.
// A purchase through that link is recorded on the hub's queue. This page does
// not tell the parent they have been paid.
async function showShare(address) {
  let data = null;
  try {
    const res = await fetch("/api/unlock/referral", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    data = await res.json();
  } catch {
    data = null;
  }
  const link = data && data.ok === true ? safeCheckoutUrl(data.link) : null;
  if (!link) return;
  try { localStorage.setItem("kide.refLink", link); } catch { /* the page still shows it */ }
  const input = $("shareLink");
  if (input) input.value = link;
  say("shareReward", "We record a referral when a family buys family play through your link. That record waits on a queue. It is not a payment from this page.");
  const box = $("share");
  if (box) box.hidden = false;
  const go = $("shareGo");
  if (go) go.addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Kide", text: COPY.shareText, url: link }); return; }
      catch { /* dismissed: fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(COPY.shareText + " " + link);
      say("shareMsg", COPY.copied);
    } catch {
      if (input) { input.focus(); input.select(); }
    }
  });
}

// The refund promise lives on riskfreetrial.org, keyed by the Stripe session.
// Only a well-formed session id is put in the link.
function showRefund(sid) {
  const note = $("refundNote");
  if (!note) return;
  const link = $("refundLink");
  if (link && /^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sid || "")) {
    link.href = "https://riskfreetrial.org/thanks?sid=" + encodeURIComponent(sid);
  }
  note.hidden = false;
}

function boot() {
  const params = new URLSearchParams(location.search);
  const back = params.get("checkout");
  if (back === "success") {
    const address = params.get("email") || "";
    showRefund(params.get("sid"));
    confirmLoop(address);
    return;
  }
  if (back === "back") funnel("checkout_back");
  else {
    const from = params.get("from");
    funnel("unlock_view", from === "gate" || from === "goodnight" ? from : "direct");
  }
  if (passed()) {
    show("pay");
    prefill();
  } else {
    armHold();
  }
  // Stripe sends every cancel here, including a browser that lost kide.grownup.
  // The sentence has to be on the panel that is actually showing.
  if (back === "back") say(passed() ? "payMsg" : "holdMsg", COPY.noCharge);

  const check = $("check");
  if (check) {
    check.addEventListener("click", () => {
      const answer = $("answer");
      if (answerMatches(hold, answer && answer.value)) {
        funnel("check_pass");
        revealPay();
      } else {
        funnel("check_fail");
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
