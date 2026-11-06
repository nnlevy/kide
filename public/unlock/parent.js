// Money path: visit → tool use → signup → paid step → Stripe.
// Grown-up hold, then the existing checkout. The price stays behind the hold.

import { ENTITLEMENT_WAIT_MS, answerMatches, makeHold, nextPoll } from "./gate.js";

const $ = (id) => document.getElementById(id);

const COPY = {
  mismatch: "That does not match. Try another answer.",
  needEmail: "Enter the email you want on the receipt.",
  needSignIn: "Sign in on the parent account, then come back to checkout.",
  retry: "Pip could not open checkout. Try again in a moment.",
  soon: "Family play is opening soon. We'll email you.",
  checking: "Checking the receipt.",
  keep: "This email can keep playing with Pip.",
  waiting: "The receipt is still on its way. Return to Pip. This page can check again.",
  copied: "Copied. Paste it in a text to another parent.",
  shareText: "Pip gets sleepy and asks to be tucked in, so screen time ends without a meltdown. Try it free:",
};

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
  prefill();
}

async function accountMe() {
  try {
    const res = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (res.status === 503) return { state: "outage" };
    if (data && data.signedIn === true && typeof data.email === "string") {
      return { state: "email", email: data.email };
    }
  } catch { /* no session */ }
  return { state: "anonymous" };
}

async function signedInEmail() {
  const who = await accountMe();
  return who.state === "email" ? who.email : "";
}

async function prefill() {
  const who = await accountMe();
  const email = $("email");
  const form = $("payForm");
  if (who.state !== "email") {
    if (form) form.hidden = false;
    if (email) {
      email.value = "";
      email.disabled = true;
    }
    say("payMsg", who.state === "outage" ? COPY.retry : COPY.needSignIn);
    return "";
  }
  const address = who.email;
  if (form) form.hidden = false;
  if (email) {
    email.disabled = false;
    email.readOnly = true;
    email.value = address;
  }
  return address;
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
  const who = await accountMe();
  if (who.state === "outage") {
    say("payMsg", COPY.retry);
    return;
  }
  if (who.state !== "email") {
    say("payMsg", COPY.needSignIn);
    return;
  }
  const address = who.email;
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
      body: JSON.stringify({}),
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

async function confirmLoop() {
  show("wait");
  say("waitMsg", COPY.checking);
  const started = Date.now();
  const address = await signedInEmail();
  async function step() {
    let result = null;
    try {
      const res = await fetch("/api/unlock/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 503) {
        say("waitMsg", COPY.retry);
        return;
      }
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
// The hub pays the sharer only when someone they sent buys family play.
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
  say("shareReward", typeof data.reward === "string" ? data.reward + "." : "");
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
    showRefund(params.get("sid"));
    confirmLoop();
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
