// The grown-up corner. Loaded only after the grown-up check passes.
//
// This is the one part of the Cast Club that talks to a server, and only for
// two things, both started by a grown-up's tap:
//   1. /api/unlock/status  -- has this family bought family play? (existing route)
//   2. /api/cast/story     -- tonight's story. The request carries ids from
//      closed lists (cast colour, leg or arm, today's chips). Never the child's
//      name: the story comes back with the word CHILD, and the name is put in
//      on this phone.

import {
  BANNED, CHAPTERS, COLORS, DOCTOR_NOTE, GAMES, LIKES, SCRIPTS, TODAY,
  dayKey, localStory, sleepsUntil, words,
} from "../content.js";
import { allStickers, wipe } from "./state.js";

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MESSAGES = [
  "Thank you for the hugs!",
  "Come and sign my cast!",
  "I'm resting and getting better.",
  "Send me a drawing, please!",
];

let api = null;

export function render(root, a) {
  api = a;
  const S = api.get();
  const w = words(S);
  const lockedChapters = CHAPTERS.filter((c) => !c.free).length;
  const lockedGames = GAMES.filter((g) => !g.free).length;
  const lockedScripts = SCRIPTS.filter((s) => !s.free).length;
  const n = sleepsUntil(S.doctorDate);

  root.innerHTML = `
  <div class="gu-head">
    <h1>Grown-up corner</h1>
    <button type="button" class="btn btn-secondary" id="guBack">Back to ${esc(w.name || "Pip")}</button>
  </div>

  <div class="doctor-note" role="note"><span class="ic" aria-hidden="true">🩺</span><div><b>Medical questions go to your child's doctor.</b>${esc(DOCTOR_NOTE)}</div></div>

  <section class="card gu-card">
    <h2>${esc(w.name ? `${w.name}'s set-up` : "Set-up")}</h2>
    <p>${esc(`A ${w.kind === "boot" || w.kind === "sling" ? "" : w.color + " "}${w.thing} on the ${w.part}${S.crutches ? ", with crutches" : ""}.`)}
    ${n != null && n >= 0 ? esc(` Next doctor visit: ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} sleeps`}.`) : n != null ? " That visit date has passed. Add the next one and Pip starts counting again." : " No doctor visit date set, so Pip isn't counting sleeps yet."}</p>
    <button type="button" class="btn btn-ghost" id="guEdit">Change set-up or visit date</button>
  </section>

  <section class="card gu-card" id="guStory">
    <h2>Tonight's story</h2>
    <p>Tap up to three things from today. Pip turns them into a short bedtime story starring ${esc(w.name || "your little one")}.</p>
    <div class="chips" id="todayChips" role="group" aria-label="What happened today">${TODAY.map((t) =>
      `<label class="chip"><input type="checkbox" value="${t.id}"><span>${esc(t.label)}</span></label>`).join("")}</div>
    <p class="gu-label">Something ${esc(w.name || "they")} love${w.name ? "s" : ""}</p>
    <div class="chips" id="likeChips" role="group" aria-label="Something they love">${LIKES.map((l) =>
      `<label class="chip"><input type="radio" name="like" value="${l.id}"><span>${esc(l.label)}</span></label>`).join("")}</div>
    <button type="button" class="btn btn-primary btn-block" id="guWrite">Write tonight's story</button>
    <p class="gu-msg" id="storyMsg" role="status"></p>
    <p class="gu-fine">Written with AI from the taps above. The name never leaves this phone: the story comes back with a blank where the name goes, and this phone fills it in. If the AI can't help, Pip writes it right here instead.</p>
  </section>

  <section class="card gu-card">
    <h2>Things to say</h2>
    <p>Short, calm words for the hard moments. They're about feelings and routine. Anything medical is a question for the doctor.</p>
    <div class="scripts">${SCRIPTS.map((s) => S.unlocked || s.free ? `
      <details class="script"><summary>${esc(s.title)}</summary>
        <p class="say">"${esc(s.say(w))}"</p>
        <p class="tip">${esc(s.tip)}</p>
      </details>` : `
      <div class="script locked"><span>${esc(s.title)}</span><span class="lock">Family play</span></div>`).join("")}</div>
  </section>

  <section class="card gu-card" id="guCard">
    <h2>A card for family</h2>
    <p>Make a picture card from ${esc(w.name || "your little one")} and Pip to send to grandparents, friends or school. It's made on this phone. You choose who gets it.</p>
    <div class="chips" id="msgChips" role="group" aria-label="Card message">${MESSAGES.map((m, i) =>
      `<label class="chip"><input type="radio" name="msg" value="${i}"${i === 0 ? " checked" : ""}><span>${esc(m)}</span></label>`).join("")}</div>
    <canvas id="cardCanvas" width="1080" height="1350" class="card-canvas" role="img" aria-label="Get-well card preview"></canvas>
    <div class="gu-actions">
      <button type="button" class="btn btn-primary" id="cardShare">Send the card</button>
      <button type="button" class="btn btn-ghost" id="cardSave">Save picture</button>
    </div>
    <p class="gu-msg" id="cardMsg" role="status"></p>
  </section>

  <section class="card gu-card" id="guFamily">
    <h2>Family play</h2>
    <div id="familyBody">${familyBody(S, lockedChapters, lockedGames, lockedScripts)}</div>
    <p class="gu-msg" id="familyMsg" role="status"></p>
  </section>

  <section class="card gu-card">
    <h2>What this stores</h2>
    <p>On this phone only: the first name or nickname you typed, the set-up, the visit date, stickers and tonight's story. No account, and nothing about your child is sent to Kide. Pages your child uses carry no ads and no analytics.</p>
    <button type="button" class="btn btn-ghost" id="guWipe">Delete everything on this phone</button>
  </section>`;

  root.querySelector("#guBack").addEventListener("click", api.back);
  root.querySelector("#guEdit").addEventListener("click", api.editSetup);
  root.querySelector("#guWrite").addEventListener("click", writeStory);
  root.querySelector("#guWipe").addEventListener("click", () => {
    if (!confirmWipe(root)) return;
    wipe();
    location.reload();
  });
  const chips = root.querySelector("#todayChips");
  chips.addEventListener("change", () => {
    const on = chips.querySelectorAll("input:checked");
    chips.querySelectorAll("input").forEach((i) => { i.disabled = on.length >= 3 && !i.checked; });
  });
  root.querySelector("#msgChips").addEventListener("change", drawCard);
  root.querySelector("#cardShare").addEventListener("click", shareCard);
  root.querySelector("#cardSave").addEventListener("click", saveCard);
  wireFamily(root);
  try { drawCard(); } catch { /* the rest of the corner still works */ }
  refreshUnlock(root);
}

function familyBody(S, ch, ga, sc) {
  if (S.unlocked) {
    return `<p><b>Family play is on.</b> Every chapter, game and script is open, plus all of Pip's play on Kide.</p>`;
  }
  return `<p data-own-price>One payment of $15 for your family. It does not renew, and it opens all of Kide, including:</p>
    <ul class="gets">
      <li>${ch} more story chapters, through to doctor day</li>
      <li>${ga} more sitting-still games</li>
      <li>${sc} more things to say, for the doctor visit, the x-ray, cast-off day and friends</li>
      <li>More stories for tonight each day</li>
      <li>All of Pip's play on Kide, still ending with Pip's goodnight</li>
    </ul>
    <a class="btn btn-primary btn-block" href="/unlock/?from=cast" id="familyGo" data-own-price>Get family play for $15</a>
    <button type="button" class="btn btn-ghost btn-block" id="familyCheck">I already paid: check again</button>`;
}

function wireFamily(root) {
  const b = root.querySelector("#familyCheck");
  if (b) b.addEventListener("click", () => refreshUnlock(root, true));
}

async function refreshUnlock(root, loud = false) {
  const msg = root.querySelector("#familyMsg");
  try {
    const res = await fetch("/api/unlock/status", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    const data = await res.json();
    const S = api.get();
    const was = S.unlocked;
    if (data && data.ok) {
      api.set({ ...S, unlocked: data.unlocked === true });
      if (data.unlocked === true && !was) { render(root, api); return; }
      if (loud) msg.textContent = data.unlocked ? "Family play is on." : "No purchase found on this phone yet. If you paid with a parent account, sign in on the account page first.";
    }
  } catch {
    if (loud) msg.textContent = "Couldn't check just now. Everything free still works.";
  }
}

async function writeStory() {
  const root = document.getElementById("guStory");
  const btn = root.querySelector("#guWrite");
  const msg = root.querySelector("#storyMsg");
  const today = [...root.querySelectorAll("#todayChips input:checked")].map((i) => i.value).slice(0, 3);
  const likeEl = root.querySelector('#likeChips input:checked');
  const like = likeEl ? likeEl.value : "";
  const S = api.get();
  btn.disabled = true;
  msg.textContent = "Pip is thinking up a story...";
  let story = null;
  try {
    const res = await fetch("/api/cast/story", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind: S.kind, where: S.where, color: S.color, crutches: S.crutches, today, like }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok && okStory(data)) {
      story = { title: data.title, pages: data.pages, ai: true };
    } else if (data && data.reason === "limit") {
      msg.textContent = S.unlocked
        ? "That's today's AI stories. Pip wrote this one right here instead."
        : "Today's AI story is used. Pip wrote this one right here instead. Family play adds more each day.";
    }
  } catch { /* offline: the local story below */ }
  if (!story) {
    story = localStory(S, today, like);
    if (!msg.textContent || msg.textContent.startsWith("Pip is thinking")) msg.textContent = "Pip wrote this one right here on the phone.";
  } else {
    msg.textContent = "Done. It's at the top of Story for tonight.";
  }
  api.set({ ...api.get(), story: { ...story, day: dayKey() } });
  btn.disabled = false;
}

function okStory(d) {
  if (typeof d.title !== "string" || !Array.isArray(d.pages) || d.pages.length < 3 || d.pages.length > 8) return false;
  const all = [d.title, ...d.pages].join(" ");
  return !BANNED.test(all) && d.pages.every((p) => typeof p === "string" && p.length > 0 && p.length <= 400);
}

/* ------------------------------------------------------------- the card */

function cardMessage() {
  const el = document.querySelector('#msgChips input:checked');
  return MESSAGES[el ? Number(el.value) : 0];
}

function drawCard() {
  const c = document.getElementById("cardCanvas");
  if (!c || !c.getContext) return;
  const x = c.getContext("2d");
  if (!x) return;
  const S = api.get();
  const w = words(S);
  const W = c.width, H = c.height;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#56C6E6");
  g.addColorStop(1, "#BDEBFF");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // hills
  x.fillStyle = "#6FD08C";
  x.beginPath(); x.ellipse(W * 0.25, H * 1.02, W * 0.6, H * 0.2, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#4FB874";
  x.beginPath(); x.ellipse(W * 0.85, H * 1.05, W * 0.55, H * 0.2, 0, 0, Math.PI * 2); x.fill();

  const font = (px, weight = 800) => `${weight} ${px}px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif`;
  x.textAlign = "center";
  x.fillStyle = "#2E3A3F";
  x.font = font(46, 700);
  x.fillText(w.name ? `A card from ${w.name} and Pip` : "A card from Pip's Cast Club", W / 2, 120);
  x.font = font(84);
  wrap(x, cardMessage(), W / 2, 230, W - 140, 96);

  drawPip(x, W / 2, 760, 300, S);

  x.fillStyle = "#2E3A3F";
  const n = sleepsUntil(S.doctorDate);
  x.font = font(52);
  const line = n != null && n >= 0
    ? n === 0 ? "Doctor day is today!" : `${n} sleep${n === 1 ? "" : "s"} until doctor day`
    : `Resting and getting better`;
  x.fillText(line, W / 2, 1130);
  const count = allStickers(S).length;
  if (count) { x.font = font(40, 700); x.fillText(`${count} brave sticker${count === 1 ? "" : "s"} so far`, W / 2, 1190); }
  x.font = font(32, 700);
  x.fillStyle = "#2E3A3F";
  x.fillText("Made with Pip at kide.us/cast", W / 2, H - 50);
}

function wrap(x, text, cx, y, max, lh) {
  const wordsArr = text.split(" ");
  let line = "";
  for (const word of wordsArr) {
    const test = line ? `${line} ${word}` : word;
    if (x.measureText(test).width > max && line) { x.fillText(line, cx, y); line = word; y += lh; }
    else line = test;
  }
  x.fillText(line, cx, y);
}

function drawPip(x, cx, cy, r, S) {
  const w = words(S);
  const hex = (COLORS.find((c) => c.id === S.color) || COLORS[0]).hex;
  // stem + leaves
  x.fillStyle = "#3D9C63";
  x.fillRect(cx - 8, cy - r * 1.18, 16, r * 0.34);
  x.fillStyle = "#6FD08C";
  x.beginPath(); x.ellipse(cx - 46, cy - r * 1.12, 50, 24, -0.4, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + 46, cy - r * 1.18, 50, 24, 0.4, 0, Math.PI * 2); x.fill();
  // feet / arms
  x.fillStyle = "#3D9C63";
  x.beginPath(); x.ellipse(cx - r * 0.42, cy + r * 0.92, r * 0.24, r * 0.13, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + r * 0.42, cy + r * 0.92, r * 0.24, r * 0.13, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx - r * 0.98, cy + r * 0.15, r * 0.14, r * 0.26, 0.4, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + r * 0.98, cy + r * 0.15, r * 0.14, r * 0.26, -0.4, 0, Math.PI * 2); x.fill();
  // body
  const bg = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  bg.addColorStop(0, "#6FD08C"); bg.addColorStop(1, "#4FB874");
  x.fillStyle = bg;
  x.beginPath(); x.ellipse(cx, cy, r * 0.95, r, 0, 0, Math.PI * 2); x.fill();
  // eyes
  for (const s of [-1, 1]) {
    x.fillStyle = "#fff";
    x.beginPath(); x.ellipse(cx + s * r * 0.32, cy - r * 0.18, r * 0.18, r * 0.21, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#2E3A3F";
    x.beginPath(); x.arc(cx + s * r * 0.32, cy - r * 0.14, r * 0.095, 0, Math.PI * 2); x.fill();
    x.fillStyle = "rgba(255,143,168,.6)";
    x.beginPath(); x.ellipse(cx + s * r * 0.55, cy + r * 0.2, r * 0.12, r * 0.07, 0, 0, Math.PI * 2); x.fill();
  }
  // smile
  x.strokeStyle = "#2E3A3F"; x.lineWidth = 12; x.lineCap = "round";
  x.beginPath(); x.moveTo(cx - r * 0.24, cy + r * 0.2); x.quadraticCurveTo(cx, cy + r * 0.48, cx + r * 0.24, cy + r * 0.2); x.stroke();
  // the cast
  const castHex = w.kind === "boot" ? "#9AA6AB" : hex;
  x.fillStyle = castHex;
  x.strokeStyle = "rgba(0,0,0,.12)"; x.lineWidth = 6;
  let box;
  if (w.where === "arm") box = [cx + r * 0.82, cy - r * 0.15, r * 0.36, r * 0.62];
  else box = [cx - r * 0.66, cy + r * 0.62, r * 0.5, r * 0.5];
  roundRect(x, ...box, 36); x.fill(); x.stroke();
  const emoji = allStickers(S).slice(-3).map((id) => ({ rest: "🌙", brave: "🦁", turns: "🤝", helper: "🌟" }[id])).filter(Boolean);
  if (emoji.length) {
    x.font = `${Math.round(box[2] / 3.2)}px sans-serif`;
    x.fillText(emoji.join(""), box[0] + box[2] / 2, box[1] + box[3] / 2 + box[2] / 10);
  }
}

function roundRect(x, X, Y, Wd, Ht, rad) {
  x.beginPath();
  x.moveTo(X + rad, Y);
  x.arcTo(X + Wd, Y, X + Wd, Y + Ht, rad);
  x.arcTo(X + Wd, Y + Ht, X, Y + Ht, rad);
  x.arcTo(X, Y + Ht, X, Y, rad);
  x.arcTo(X, Y, X + Wd, Y, rad);
  x.closePath();
}

function cardBlob() {
  const c = document.getElementById("cardCanvas");
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

async function shareCard() {
  const msg = document.getElementById("cardMsg");
  drawCard();
  const blob = await cardBlob();
  if (!blob) { msg.textContent = "Couldn't make the picture on this browser."; return; }
  const file = new File([blob], "get-well-card.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "A card from Pip's Cast Club" });
      msg.textContent = "Sent. Pip says thank you.";
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  download(blob);
  msg.textContent = "Saved the picture. Send it from your photos or messages.";
}

async function saveCard() {
  drawCard();
  const blob = await cardBlob();
  if (blob) download(blob);
}

function download(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "get-well-card.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function confirmWipe(root) {
  const b = root.querySelector("#guWipe");
  if (b.dataset.armed === "1") return true;
  b.dataset.armed = "1";
  b.textContent = "Tap again to delete everything";
  return false;
}
