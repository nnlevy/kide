// Pip's Cast Club: the child's side and the grown-up set-up.
//
// PRIVACY RULE FOR THIS FILE: no network. No fetch, no beacon, no analytics.
// The child's side of the app runs entirely on the device. Anything that talks
// to a server lives in grownup.js and is only imported after the grown-up
// check passes. test-cast.mjs fails the build if that ever changes.

import {
  CHAPTERS, COLORS, GAMES, KINDS, STICKERS, WHERE,
  chapterTitle, cleanName, dayKey, sleepsUntil, words,
} from "../content.js";
import { mountPip } from "../pip-cast.js";
import { GAME_RUNNERS } from "./games.js";
import { makeHold, answerMatches } from "/unlock/gate.js";
import { addSticker, allStickers, load, save, todayStickers } from "./state.js";

let S = load();
let stopGame = null;
let oneMoreUsed = false;
let afterGate = null;
let hold = null;

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SCREENS = ["setup", "handoff", "home", "story", "reader", "stickers", "games", "game", "sleepy", "night", "gate", "grownup"];
const NIGHT = new Set(["sleepy", "night"]);
const KID = new Set(["handoff", "home", "story", "reader", "stickers", "games", "game", "sleepy", "night"]);

function show(name) {
  if (stopGame) { stopGame(); stopGame = null; }
  for (const s of SCREENS) { const el = $(s); if (el) el.hidden = s !== name; }
  document.body.classList.toggle("is-kid", KID.has(name));
  document.body.classList.toggle("is-night", name === "night");
  document.body.classList.toggle("is-dusk", name === "sleepy");
  scrollTo(0, 0);
  const h = $(name) && $(name).querySelector("h1, h2");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}

const has = (item) => S.unlocked || item.free === true;

/* ------------------------------------------------------------- set-up */

function fillChoices() {
  $("kindPick").innerHTML = Object.entries(KINDS).map(([id, k]) =>
    `<label class="chip"><input type="radio" name="kind" value="${id}"><span>${k.label}</span></label>`).join("");
  $("wherePick").innerHTML = Object.entries(WHERE).map(([id, k]) =>
    `<label class="chip"><input type="radio" name="where" value="${id}"><span>${k.label}</span></label>`).join("");
  $("colorPick").innerHTML = COLORS.map((c) =>
    `<label class="swatch" style="--sw:${c.hex}"><input type="radio" name="color" value="${c.id}"><span>${c.label}</span></label>`).join("");
}

function readSetup() {
  const f = $("setupForm");
  const get = (n) => (f.querySelector(`input[name="${n}"]:checked`) || {}).value;
  return {
    ...S,
    name: cleanName($("nameIn").value),
    kind: get("kind") || "cast",
    where: get("where") || "leg",
    color: get("color") || "blue",
    crutches: $("crutchIn").checked,
    doctorDate: $("dateIn").value || "",
  };
}

function writeSetup() {
  const f = $("setupForm");
  $("nameIn").value = S.name;
  $("dateIn").value = S.doctorDate;
  $("crutchIn").checked = S.crutches;
  for (const [n, v] of [["kind", S.kind], ["where", S.where], ["color", S.color]]) {
    const el = f.querySelector(`input[name="${n}"][value="${v}"]`);
    if (el) el.checked = true;
  }
  $("dateIn").min = dayKey();
  previewSetup();
}

function previewSetup() {
  const draft = readSetup();
  const w = words(draft);
  // Sling means arm, boot means leg: keep the form honest about it.
  const lockWhere = draft.kind === "sling" ? "arm" : draft.kind === "boot" ? "leg" : null;
  $("setupForm").querySelectorAll('input[name="where"]').forEach((el) => {
    el.disabled = !!lockWhere && el.value !== lockWhere;
    if (lockWhere && el.value === lockWhere) el.checked = true;
  });
  $("crutchRow").hidden = w.where !== "leg";
  $("colorRow").hidden = draft.kind === "boot";
  mountPip($("setupPip"), { setup: { ...draft, where: w.where }, mood: "happy" });
  $("setupSay").textContent = `Pip has a ${w.kind === "boot" || w.kind === "sling" ? "" : w.color + " "}${w.thing} on the ${w.part}, just like ${w.friend}.`;
}

/* ------------------------------------------------------------- kid side */

function countdownText(prefix = "") {
  const n = sleepsUntil(S.doctorDate);
  if (n == null || n < 0) return "";
  if (n === 0) return `${prefix}Doctor day is today!`;
  if (n === 1) return `${prefix}1 more sleep until doctor day`;
  return `${prefix}${n} sleeps until doctor day`;
}

function renderCountdown(el) {
  const n = sleepsUntil(S.doctorDate);
  if (n == null || n < 0) { el.hidden = true; return; }
  el.hidden = false;
  const moons = n > 0 && n <= 14 ? `<span class="moons" aria-hidden="true">${"🌙".repeat(n)}</span>` : "";
  el.innerHTML = `<b>${esc(countdownText())}</b>${moons}`;
}

function stickerEmoji() {
  return allStickers(S).map((id) => (STICKERS.find((s) => s.id === id) || {}).emoji).filter(Boolean);
}

function home() {
  const w = words(S);
  $("homeHello").textContent = w.name ? `Hi, ${w.name}!` : "Hi, friend!";
  mountPip($("homePip"), { setup: S, stickers: stickerEmoji(), mood: "happy" });
  renderCountdown($("homeCount"));
  show("home");
}

function storyList() {
  const w = words(S);
  const rows = [];
  if (S.story && S.story.day === dayKey()) {
    const title = S.story.title.replace(/\bCHILD\b/g, w.name || "Pip's friend");
    rows.push(`<button type="button" class="tile tile-story" data-story="tonight"><span class="em" aria-hidden="true">✨</span><b>${esc(title)}</b><span>Tonight's story</span></button>`);
  }
  CHAPTERS.forEach((ch, i) => {
    if (!has(ch)) return;
    const read = S.chaptersRead.includes(ch.id);
    rows.push(`<button type="button" class="tile tile-story" data-story="${ch.id}"><span class="em" aria-hidden="true">${read ? "📗" : "📖"}</span><b>${esc(chapterTitle(ch, w))}</b><span>Chapter ${i + 1}</span></button>`);
  });
  $("storyTiles").innerHTML = rows.join("");
  $("storyTiles").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => openStory(b.dataset.story)));
  show("story");
}

let reader = null;
function openStory(id) {
  const w = words(S);
  if (id === "tonight") {
    const who = w.name || "Pip's friend";
    const fill = (t) => t.replace(/\bCHILD\b/g, who);
    reader = { id, title: fill(S.story.title), pages: S.story.pages.map(fill), i: 0, ai: S.story.ai };
  } else {
    const ch = CHAPTERS.find((c) => c.id === id);
    if (!ch || !has(ch)) return;
    reader = { id, title: chapterTitle(ch, w), pages: ch.pages(w), i: 0 };
  }
  page();
  show("reader");
}

function page() {
  const r = reader;
  $("readerTitle").textContent = r.title;
  $("readerText").textContent = r.pages[r.i];
  $("readerStep").textContent = `Page ${r.i + 1} of ${r.pages.length}`;
  $("readerBack").disabled = r.i === 0;
  $("readerNext").textContent = r.i === r.pages.length - 1 ? "The end" : "Next page";
  $("readerAi").hidden = !(r.id === "tonight" && r.ai);
  const last = r.i === r.pages.length - 1;
  mountPip($("readerPip"), { setup: S, stickers: stickerEmoji(), mood: last ? "cheer" : "happy" });
}

function stickers() {
  $("stickerBtns").innerHTML = STICKERS.map((s) =>
    `<button type="button" class="tile tile-sticker" data-id="${s.id}"><span class="em" aria-hidden="true">${s.emoji}</span><b>${esc(s.label)}</b></button>`).join("");
  $("stickerBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    // One of each kind a day, so a sticker still means something tomorrow.
    if (todayStickers(S).includes(b.dataset.id)) {
      $("stickerToday").textContent = "Pip already has that one today. Try another!";
      return;
    }
    S = addSticker(S, b.dataset.id);
    save(S);
    drawStickers(true);
  }));
  drawStickers(false);
  show("stickers");
}

function drawStickers(cheer) {
  const today = todayStickers(S).map((id) => (STICKERS.find((s) => s.id === id) || {}).emoji).filter(Boolean);
  const box = $("stickerPip");
  mountPip(box, { setup: S, stickers: stickerEmoji(), mood: cheer ? "cheer" : "happy" });
  if (cheer) { box.classList.remove("pip-cheer"); void box.offsetWidth; box.classList.add("pip-cheer"); }
  const total = allStickers(S).length;
  $("stickerToday").textContent = today.length ? `Today: ${today.join(" ")}` : "No stickers yet today. Which one did you earn?";
  $("stickerTotal").textContent = total ? `${total} sticker${total === 1 ? "" : "s"} on Pip's ${words(S).thing} so far` : "";
}

function games() {
  $("gameTiles").innerHTML = GAMES.filter(has).map((g) =>
    `<button type="button" class="tile" data-id="${g.id}"><span class="em" aria-hidden="true">${g.emoji}</span><b>${esc(g.title)}</b></button>`).join("");
  $("gameTiles").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => playGame(b.dataset.id)));
  show("games");
}

function playGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (!g || !has(g)) return;
  show("game");
  $("gameTitle").textContent = g.title;
  stopGame = GAME_RUNNERS[id]($("gameRoot"), S, sleepy) || null;
}

function sleepy() {
  const w = words(S);
  mountPip($("sleepyPip"), { setup: S, stickers: stickerEmoji(), mood: "sleepy" });
  $("sleepySay").textContent = `Pip's ${w.part} is getting sleepy. Resting helps. Should we tuck Pip in?`;
  $("oneMore").hidden = oneMoreUsed;
  show("sleepy");
}

function night() {
  const w = words(S);
  mountPip($("nightPip"), { setup: S, stickers: stickerEmoji(), mood: "sleepy" });
  $("nightSay").textContent = `Goodnight, Pip. Goodnight, ${w.thing}.${w.name ? ` Goodnight, ${w.name}.` : ""}`;
  const c = countdownText();
  $("nightCount").textContent = c;
  $("nightCount").hidden = !c;
  show("night");
}

/* ------------------------------------------------------------- grown-ups */

function gate(then) {
  afterGate = then;
  hold = makeHold();
  $("gatePrompt").textContent = hold.prompt;
  $("gateIn").value = "";
  $("gateMsg").textContent = "";
  show("gate");
  setTimeout(() => $("gateIn").focus(), 50);
}

function checkGate(e) {
  e.preventDefault();
  if (!answerMatches(hold, $("gateIn").value)) {
    $("gateMsg").textContent = "Not quite. Grown-ups only, please.";
    hold = makeHold();
    $("gatePrompt").textContent = hold.prompt;
    $("gateIn").value = "";
    return;
  }
  const then = afterGate;
  afterGate = null;
  then();
}

async function grownup() {
  show("grownup");
  const mod = await import("./grownup.js");
  mod.render($("grownupRoot"), {
    get: () => S,
    set: (next) => { S = next; save(S); },
    back: () => home(),
    editSetup: () => { writeSetup(); show("setup"); },
  });
}

/* ------------------------------------------------------------- wiring */

function wire() {
  fillChoices();
  $("setupForm").addEventListener("input", previewSetup);
  $("setupForm").addEventListener("change", previewSetup);
  $("setupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    S = { ...readSetup(), setupDone: true };
    save(S);
    const w = words(S);
    $("handoffSay").textContent = w.name ? `Hand the phone to ${w.name}.` : "Hand the phone to your little one.";
    $("handoffGo").textContent = w.name ? `${w.name}, tap to meet Pip` : "Tap to meet Pip";
    mountPip($("handoffPip"), { setup: S, mood: "happy" });
    show("handoff");
  });
  $("handoffGo").addEventListener("click", home);
  $("goStory").addEventListener("click", storyList);
  $("goStickers").addEventListener("click", stickers);
  $("goGames").addEventListener("click", games);
  $("goRest").addEventListener("click", sleepy);
  document.querySelectorAll("[data-home]").forEach((b) => b.addEventListener("click", home));
  $("readerBack").addEventListener("click", () => { if (reader.i > 0) { reader.i--; page(); } });
  $("readerNext").addEventListener("click", () => {
    if (reader.i < reader.pages.length - 1) { reader.i++; page(); return; }
    if (reader.id !== "tonight" && !S.chaptersRead.includes(reader.id)) {
      S = { ...S, chaptersRead: S.chaptersRead.concat(reader.id) };
      save(S);
    }
    sleepy();
  });
  $("tuckIn").addEventListener("click", night);
  $("oneMore").addEventListener("click", () => { oneMoreUsed = true; home(); });
  $("wakePip").addEventListener("click", () => gate(() => { oneMoreUsed = false; home(); }));
  document.querySelectorAll("[data-grownup]").forEach((b) => b.addEventListener("click", () => gate(grownup)));
  $("gateForm").addEventListener("submit", checkGate);
  $("gateCancel").addEventListener("click", () => (S.setupDone ? home() : show("setup")));
}

wire();
if (S.setupDone) {
  home();
} else {
  writeSetup();
  show("setup");
}

