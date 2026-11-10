// Everything the Cast Club remembers, in this browser only. A first name or
// nickname, the set-up, the dates a grown-up typed, and the stickers. It never
// leaves the device: no module on the child's side of the app makes a network
// request (test-cast.mjs enforces that).

import { cleanName, dayKey, KINDS, WHERE, COLORS } from "../content.js";

const KEY = "kide.cast.v1";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function blank() {
  return {
    v: 1,
    name: "",
    kind: "cast",
    where: "leg",
    color: "blue",
    crutches: false,
    doctorDate: "",
    stickers: {},
    chaptersRead: [],
    story: null,
    unlocked: false,
    setupDone: false,
  };
}

export function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  s.name = cleanName(raw.name);
  if (KINDS[raw.kind]) s.kind = raw.kind;
  if (WHERE[raw.where]) s.where = raw.where;
  if (s.kind === "sling") s.where = "arm";
  if (s.kind === "boot") s.where = "leg";
  if (COLORS.some((c) => c.id === raw.color)) s.color = raw.color;
  s.crutches = raw.crutches === true && s.where === "leg";
  s.doctorDate = DATE.test(String(raw.doctorDate || "")) ? raw.doctorDate : "";
  if (raw.stickers && typeof raw.stickers === "object") {
    for (const [day, list] of Object.entries(raw.stickers)) {
      if (DATE.test(day) && Array.isArray(list)) s.stickers[day] = list.filter((x) => typeof x === "string").slice(0, 40);
    }
  }
  if (Array.isArray(raw.chaptersRead)) s.chaptersRead = raw.chaptersRead.filter((x) => typeof x === "string").slice(0, 20);
  if (raw.story && typeof raw.story === "object" && Array.isArray(raw.story.pages)) {
    s.story = {
      day: DATE.test(String(raw.story.day || "")) ? raw.story.day : "",
      title: String(raw.story.title || "").slice(0, 80),
      pages: raw.story.pages.map((p) => String(p).slice(0, 400)).slice(0, 8),
      ai: raw.story.ai === true,
    };
  }
  s.unlocked = raw.unlocked === true;
  s.setupDone = raw.setupDone === true;
  return s;
}

export function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return blank();
  }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitize(s))); } catch { /* private mode: lives for this visit */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}

export function todayStickers(s, now = new Date()) {
  return s.stickers[dayKey(now)] || [];
}

export function allStickers(s) {
  return Object.keys(s.stickers).sort().flatMap((d) => s.stickers[d]);
}

export function addSticker(s, id, now = new Date()) {
  const k = dayKey(now);
  const list = (s.stickers[k] || []).concat(id).slice(-40);
  return { ...s, stickers: { ...s.stickers, [k]: list } };
}
