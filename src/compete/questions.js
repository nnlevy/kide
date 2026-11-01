// Trickier questions. The reply the player sees never includes the answer.
// Higher tiers add nearer distractors, lookalike letters, and a shorter clock.

import { START_TIER, MAX_TIER, limitForTier } from "./score.js";

const OPT_IDS = ["a", "b", "c", "d", "e", "f"];
const KINDS = ["colors", "counting", "shapes", "letters", "feelings"];

const COLORS = [
  { word: "Red", swatch: "#FF6B6B", emoji: "🍎" },
  { word: "Blue", swatch: "#4EA8DE", emoji: "🫐" },
  { word: "Yellow", swatch: "#FFD166", emoji: "🍋" },
  { word: "Green", swatch: "#6FD08C", emoji: "🍃" },
  { word: "Purple", swatch: "#B497D6", emoji: "🍇" },
  { word: "Orange", swatch: "#FF9F5B", emoji: "🍊" },
];

const SHAPES = [
  { word: "Circle", shape: "circle", plain: "Find the circle!", hard: ["Which one rolls?", "Which one is round?"] },
  { word: "Square", shape: "square", plain: "Find the square!", hard: ["Which one has four sides?", "Which one looks like a window?"] },
  { word: "Triangle", shape: "triangle", plain: "Find the triangle!", hard: ["Which one has three sides?", "Which one looks like a tent?"] },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CONFUSABLE = [["E", "F"], ["M", "W"], ["O", "Q"], ["P", "R"], ["C", "G"], ["V", "W"], ["B", "D"]];

const FEELINGS = [
  { word: "Happy", feel: "happy" },
  { word: "Sad", feel: "sad" },
  { word: "Angry", feel: "angry" },
  { word: "Scared", feel: "scared" },
  { word: "Surprised", feel: "surprised" },
];

const STORIES = [
  { feel: "happy", text: "Someone got a big hug." },
  { feel: "happy", text: "Someone's friend came to play." },
  { feel: "sad", text: "Someone's ice cream fell." },
  { feel: "sad", text: "Someone's friend had to go home." },
  { feel: "angry", text: "Someone knocked over a tower they just built." },
  { feel: "scared", text: "A very big dog barked, very loudly." },
  { feel: "surprised", text: "Someone opened a box, and a puppy was inside!" },
];

const MARKS = ["star", "apple", "balloon", "leaf", "shell"];

function clampTier(tier) {
  const t = Math.floor(Number(tier));
  if (!Number.isFinite(t)) return START_TIER;
  return Math.min(MAX_TIER, Math.max(START_TIER, t));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function asOptions(rng, rows, labelOf) {
  return shuffle(rng, rows).map((row, i) => {
    const opt = { id: OPT_IDS[i], label: labelOf(row) };
    if (row.swatch) opt.swatch = row.swatch;
    if (row.emoji) opt.emoji = row.emoji;
    if (row.shape) opt.shape = row.shape;
    if (row.feel) opt.feel = row.feel;
    return opt;
  });
}

function countingQuestion(tier, rng) {
  let min = 2;
  let max = 5;
  let nOpts = 3;
  if (tier >= 5) { min = 6; max = 12; nOpts = 4; }
  else if (tier >= 4) { min = 4; max = 8; nOpts = 4; }
  const target = min + Math.floor(rng() * (max - min + 1));
  const bag = new Set([target]);
  let guard = 0;
  const span = tier >= 4 ? 1 : 2;
  while (bag.size < nOpts && guard++ < 40) {
    const delta = (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * span));
    const d = target + delta;
    if (d >= 1 && d <= 14) bag.add(d);
  }
  while (bag.size < nOpts) bag.add(target + bag.size);
  const options = asOptions(rng, [...bag].map((n) => ({ label: String(n) })), (r) => r.label);
  return {
    kind: "counting",
    prompt: "How many?",
    mark: pick(rng, MARKS),
    count: target,
    options,
    answer: options.find((o) => o.label === String(target)).id,
  };
}

function colorQuestion(tier, rng) {
  const n = tier >= 5 ? 6 : tier >= 4 ? 4 : 3;
  const target = pick(rng, COLORS);
  const rest = shuffle(rng, COLORS.filter((c) => c.word !== target.word)).slice(0, n - 1);
  const options = asOptions(rng, [target, ...rest], (c) => c.word);
  return {
    kind: "colors",
    prompt: "Find something " + target.word.toLowerCase() + "!",
    options,
    answer: options.find((o) => o.label === target.word).id,
  };
}

function shapeQuestion(tier, rng) {
  const target = pick(rng, SHAPES);
  const options = asOptions(rng, SHAPES, (s) => s.word);
  const prompt = tier >= 4 ? pick(rng, target.hard) : target.plain;
  return {
    kind: "shapes",
    prompt,
    options,
    answer: options.find((o) => o.label === target.word).id,
  };
}

function letterQuestion(tier, rng) {
  let target;
  let pool;
  if (tier >= 5) {
    const pair = pick(rng, CONFUSABLE);
    target = pick(rng, pair);
    const mate = pair.find((l) => l !== target);
    const others = shuffle(rng, LETTERS.filter((l) => l !== target && l !== mate)).slice(0, 2);
    pool = [mate, ...others];
  } else {
    const n = tier >= 4 ? 4 : 3;
    target = pick(rng, LETTERS);
    pool = shuffle(rng, LETTERS.filter((l) => l !== target)).slice(0, n - 1);
  }
  const options = asOptions(rng, [target, ...pool].map((l) => ({ label: l })), (r) => r.label);
  return {
    kind: "letters",
    prompt: "Find the letter " + target + "!",
    options,
    answer: options.find((o) => o.label === target).id,
  };
}

function feelingQuestion(tier, rng) {
  if (tier < 4) {
    const story = pick(rng, STORIES);
    const rest = shuffle(rng, FEELINGS.filter((f) => f.feel !== story.feel)).slice(0, 2);
    const face = FEELINGS.find((f) => f.feel === story.feel);
    const options = asOptions(rng, [face, ...rest], (f) => f.word);
    return {
      kind: "feelings",
      prompt: story.text,
      cue: "How do they feel?",
      options,
      answer: options.find((o) => o.feel === story.feel).id,
    };
  }
  const n = tier >= 5 ? 5 : 4;
  const target = pick(rng, FEELINGS);
  const rest = shuffle(rng, FEELINGS.filter((f) => f.feel !== target.feel)).slice(0, n - 1);
  const options = asOptions(rng, [target, ...rest], (f) => f.word);
  return {
    kind: "feelings",
    prompt: "Who feels " + target.word.toLowerCase() + "?",
    options,
    answer: options.find((o) => o.feel === target.feel).id,
  };
}

const BUILDERS = {
  colors: colorQuestion,
  counting: countingQuestion,
  shapes: shapeQuestion,
  letters: letterQuestion,
  feelings: feelingQuestion,
};

export function makeQuestion(tier, rng, now, id, kind) {
  const t = clampTier(tier);
  const k = BUILDERS[kind] ? kind : pick(rng, KINDS);
  const built = BUILDERS[k](t, rng);
  const limitMs = limitForTier(t);
  const secret = {
    id,
    tier: t,
    answer: built.answer,
    issuedAt: now,
    limitMs,
    used: false,
  };
  const pub = {
    id,
    tier: t,
    kind: built.kind,
    prompt: built.prompt,
    options: built.options,
    limitMs,
  };
  if (built.cue) pub.cue = built.cue;
  if (built.mark) pub.mark = built.mark;
  if (typeof built.count === "number") pub.count = built.count;
  return { secret, pub };
}
