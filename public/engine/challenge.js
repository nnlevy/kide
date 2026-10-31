// Challenge mode.
//
// Ordinary play records how long a correct answer took. When that average
// over ten or more answers is quick, the game may offer a harder round:
// a timer, points, a streak, and questions that climb. Points are figured
// here, from the clock on this side, and a weekly board is optional.
//
// What is stored for the board: a nickname a grown-up chose, and points.
// No child name, no email, no voice, no practice record. The id is a random
// token the browser made up.

export const FAST_MIN_ANSWERS = 10;
// A toddler who listens to Pip and then looks lands slower than this.
// A reader who already knows the answer lands under it. Mean, not a single tap.
export const FAST_AVG_MS = 2500;
export const SPEED_WINDOW = 40;

// Quicker than a person can see the choices and move. Replies under this
// earn nothing, and the question cannot be replayed more slowly.
export const MIN_HUMAN_MS = 350;
// A tap that left the browser just as the bar emptied can still be on time.
export const ARRIVAL_GRACE_MS = 800;
export const WINDOW_MS = 10 * 60 * 1000;
export const WINDOW_MAX = 40;
export const BOARD_CAP = 20;
export const CHALLENGE_START_TIER = 3;
export const CHALLENGE_MAX_TIER = 5;

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
  { feel: "happy", text: "Someone's best friend came to play." },
  { feel: "sad", text: "Someone's ice cream fell on the ground." },
  { feel: "sad", text: "Someone's friend had to go home." },
  { feel: "angry", text: "Someone knocked over the tower they just built." },
  { feel: "scared", text: "A very big dog barked, very loudly." },
  { feel: "surprised", text: "Someone opened a box, and a puppy was inside!" },
];

const MARKS = ["star", "apple", "balloon", "leaf", "shell"];

const Q_TTL = 120;

function clampInt(n, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(x, max);
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

function usableTime(ms) {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 80 && ms <= 120000;
}

/** Rolling list of milliseconds-to-correct. Outliers are dropped, not stored. */
export function noteCorrectTime(times, ms) {
  const prev = (Array.isArray(times) ? times : []).filter(usableTime).slice(-SPEED_WINDOW);
  if (!usableTime(ms)) return prev;
  const next = prev.concat([Math.round(ms)]);
  return next.length > SPEED_WINDOW ? next.slice(-SPEED_WINDOW) : next;
}

/** fast is true only once there are enough correct answers, on the mean. */
export function speedRead(times) {
  const clean = (Array.isArray(times) ? times : []).filter(usableTime);
  const n = clean.length;
  if (!n) return { n: 0, avg: null, fast: false };
  const avg = clean.reduce((sum, t) => sum + t, 0) / n;
  return { n, avg, fast: n >= FAST_MIN_ANSWERS && avg <= FAST_AVG_MS };
}

export function tierForStreak(streak) {
  const steps = Math.floor(clampInt(streak, 1000) / 3);
  return Math.min(CHALLENGE_MAX_TIER, CHALLENGE_START_TIER + steps);
}

export function limitForTier(tier) {
  if (tier >= 5) return 6000;
  if (tier >= 4) return 7500;
  return 9000;
}

/**
 * Points for one correct answer. `streak` is the run length including this
 * answer. Faster, higher tier, and a longer run are each worth more.
 * There is no argument for a number the browser claims to have earned.
 */
export function pointsFor(tier, elapsed, limitMs, streak) {
  const t = Math.min(CHALLENGE_MAX_TIER, Math.max(1, clampInt(tier, 9) || 1));
  const limit = Math.max(1, Number(limitMs) || 1);
  const spent = Math.max(0, Math.min(limit, Number(elapsed) || 0));
  const base = 10 * t;
  const speed = Math.round(((limit - spent) / limit) * 8 * t);
  const mult = 1 + Math.min(Math.max(clampInt(streak, 100) - 1, 0), 5) * 0.25;
  return Math.max(1, Math.round((base + speed) * mult));
}

/**
 * Decide one reply. `now` and `issuedAt` are both this side's clock.
 * A reused question, a clock that runs backwards, or a reply quicker than
 * a person can move is not scored. A wrong tap or an empty one ends the run.
 */
export function judge({ issuedAt, now, limitMs, used, choice, answer, tier, streak }) {
  const blank = { accepted: false, correct: false, points: 0, streak: 0, consume: false };
  if (used) return blank;
  if (typeof now !== "number" || typeof issuedAt !== "number" || now < issuedAt) {
    return { ...blank, consume: true };
  }
  const elapsed = now - issuedAt;
  if (elapsed < MIN_HUMAN_MS) return { ...blank, consume: true };
  const gaveUp = choice == null || choice === "";
  const late = elapsed > limitMs + ARRIVAL_GRACE_MS;
  if (gaveUp || late || typeof choice !== "string" || choice !== answer) {
    return { accepted: true, correct: false, points: 0, streak: 0, consume: true };
  }
  const next = clampInt(streak, 1000) + 1;
  return {
    accepted: true,
    correct: true,
    points: pointsFor(tier, elapsed, limitMs, next),
    streak: next,
    consume: true,
  };
}

function asOptions(rng, rows, labelOf) {
  const options = shuffle(rng, rows).map((row, i) => {
    const opt = { id: OPT_IDS[i], label: labelOf(row) };
    if (row.swatch) opt.swatch = row.swatch;
    if (row.emoji) opt.emoji = row.emoji;
    if (row.shape) opt.shape = row.shape;
    if (row.feel) opt.feel = row.feel;
    return opt;
  });
  return options;
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
  while (bag.size < nOpts && guard++ < 30) {
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
    pool = LETTERS.filter((l) => l !== target);
    const mate = pair.find((l) => l !== target);
    const others = shuffle(rng, pool.filter((l) => l !== mate)).slice(0, 2);
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

/** A question, split into what the player may see and what stays here. */
export function makeQuestion(tier, rng, now, id, kind) {
  const t = Math.min(CHALLENGE_MAX_TIER, Math.max(CHALLENGE_START_TIER, clampInt(tier, 9) || CHALLENGE_START_TIER));
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

export function cleanHandle(raw) {
  const s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 16) {
    return { ok: false, error: "Pick a nickname of 2 to 16 letters." };
  }
  if (/@/.test(s) || /[.]/.test(s) || /https?:/i.test(s) || /[/\\]/.test(s)) {
    return { ok: false, error: "A nickname, not an email or a link." };
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 7) return { ok: false, error: "A nickname, not a phone number." };
  if (/^\d+$/.test(s)) return { ok: false, error: "Add a word, not only numbers." };
  if (!/^[\p{L}\p{N} ]+$/u.test(s)) {
    return { ok: false, error: "Letters, numbers, and spaces only." };
  }
  return { ok: true, handle: s };
}

export function validPlayerId(id) {
  return typeof id === "string" && /^[a-z0-9]{16,40}$/.test(id);
}

/** ISO week, UTC. Two plays in the same week share one board. */
export function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

export function defaultRng() {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  };
}

export function randomId(rng) {
  let s = "";
  for (let i = 0; i < 18; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}

function spentIds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) {
    if (typeof id === "string" && /^[a-z0-9]{8,24}$/.test(id) && out.indexOf(id) === -1) out.push(id);
  }
  return out.slice(-WINDOW_MAX);
}

function rememberSpent(player, id) {
  if (typeof id !== "string" || !/^[a-z0-9]{8,24}$/.test(id)) return;
  const next = spentIds(player.spent);
  if (next.indexOf(id) === -1) next.push(id);
  player.spent = next.slice(-WINDOW_MAX);
}

export function freshPlayer(now) {
  return {
    handle: "",
    show: false,
    week: weekKey(new Date(now)),
    weekPoints: 0,
    streak: 0,
    openId: null,
    windowStart: 0,
    windowCount: 0,
    spent: [],
  };
}

/** Drop anything that is not the anonymous board record.
 *  The nickname is kept only while the board is on. `spent` is the list of
 *  question ids already settled, stored beside the points so a second reply
 *  cannot add to them. */
export function freezePlayer(p, now) {
  const base = freshPlayer(now || Date.now());
  const cleaned = cleanHandle(p && p.handle);
  const show = p?.show === true && cleaned.ok;
  return {
    handle: show ? cleaned.handle : "",
    show,
    week: typeof p?.week === "string" && /^\d{4}-W\d{2}$/.test(p.week) ? p.week : base.week,
    weekPoints: clampInt(p && p.weekPoints, 1000000),
    streak: clampInt(p && p.streak, 1000),
    openId: typeof p?.openId === "string" && /^[a-z0-9]{8,24}$/.test(p.openId) ? p.openId : null,
    windowStart: clampInt(p && p.windowStart, 1e15),
    windowCount: clampInt(p && p.windowCount, 100000),
    spent: spentIds(p && p.spent),
  };
}

const keyQ = (id) => "chal:q:" + id;
const keyP = (id) => "chal:p:" + id;
const keyB = (week) => "chal:w:" + week;

async function readJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function loadPlayer(kv, playerId, now) {
  const stored = await readJson(kv, keyP(playerId));
  return freezePlayer(stored || freshPlayer(now), now);
}

async function savePlayer(kv, playerId, player, now) {
  await kv.put(keyP(playerId), JSON.stringify(freezePlayer(player, now)));
}

async function loadQuestion(kv, id) {
  return readJson(kv, keyQ(id));
}

async function saveQuestion(kv, secret) {
  await kv.put(keyQ(secret.id), JSON.stringify({
    id: secret.id,
    playerId: secret.playerId,
    tier: secret.tier,
    answer: secret.answer,
    issuedAt: secret.issuedAt,
    limitMs: secret.limitMs,
    used: !!secret.used,
  }), { expirationTtl: Q_TTL });
}

async function loadBoard(kv, week) {
  const rows = await readJson(kv, keyB(week));
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && validPlayerId(r.id) && typeof r.handle === "string" && typeof r.points === "number");
}

async function saveBoard(kv, week, rows) {
  const clean = [];
  for (const r of rows.slice(0, 50)) {
    const h = cleanHandle(r && r.handle);
    if (!h.ok || !validPlayerId(r && r.id)) continue;
    clean.push({ id: r.id, handle: h.handle, points: clampInt(r.points, 1000000) });
  }
  await kv.put(keyB(week), JSON.stringify(clean));
}

function rollWeek(player, now) {
  const week = weekKey(new Date(now));
  if (player.week !== week) {
    player.week = week;
    player.weekPoints = 0;
    player.streak = 0;
  }
  return week;
}

function withinWindow(player, now) {
  if (!player.windowStart || now - player.windowStart >= WINDOW_MS) {
    player.windowStart = now;
    player.windowCount = 0;
  }
  return player.windowCount < WINDOW_MAX;
}

async function closeOpen(kv, player) {
  if (!player.openId) return;
  const prev = await loadQuestion(kv, player.openId);
  if (prev && !prev.used) {
    prev.used = true;
    await saveQuestion(kv, prev);
    player.streak = 0;
  }
  rememberSpent(player, player.openId);
  player.openId = null;
}

export async function issueQuestion(kv, playerId, now, rng) {
  const player = await loadPlayer(kv, playerId, now);
  rollWeek(player, now);
  if (!withinWindow(player, now)) {
    await savePlayer(kv, playerId, player, now);
    return { status: 429, body: { ok: false, error: "rest" } };
  }
  await closeOpen(kv, player);
  player.windowCount += 1;
  const tier = tierForStreak(player.streak);
  const id = randomId(rng);
  const { secret, pub } = makeQuestion(tier, rng, now, id);
  secret.playerId = playerId;
  player.openId = id;
  await saveQuestion(kv, secret);
  await savePlayer(kv, playerId, player, now);
  return {
    status: 200,
    body: {
      ok: true,
      question: pub,
      streak: player.streak,
      weekPoints: player.weekPoints,
    },
  };
}

async function putOnBoard(kv, player, playerId) {
  if (!player.show || !player.handle) return;
  const rows = await loadBoard(kv, player.week);
  const next = rows.filter((r) => r.id !== playerId);
  next.push({ id: playerId, handle: player.handle, points: player.weekPoints });
  next.sort((a, b) => b.points - a.points || a.handle.localeCompare(b.handle));
  await saveBoard(kv, player.week, next.slice(0, 50));
}

async function takeOffBoard(kv, playerId, week) {
  const rows = await loadBoard(kv, week);
  await saveBoard(kv, week, rows.filter((r) => r.id !== playerId));
}

export async function answerQuestion(kv, playerId, questionId, choice, now) {
  const player = await loadPlayer(kv, playerId, now);
  rollWeek(player, now);
  // Settled ids live on the same record as the points. A replay that still
  // sees the question as open — a second request, or a stale read — cannot
  // add points or stretch the run.
  if (questionId && player.spent.indexOf(questionId) !== -1) {
    await savePlayer(kv, playerId, player, now);
    return {
      status: 200,
      body: {
        ok: true,
        correct: false,
        points: 0,
        streak: player.streak,
        weekPoints: player.weekPoints,
      },
    };
  }
  const q = questionId ? await loadQuestion(kv, questionId) : null;
  // A second delivery of a question that was already settled must not wipe a
  // run. Only the first reply counts, whichever way it went.
  if (!q || q.playerId !== playerId || q.used) {
    await savePlayer(kv, playerId, player, now);
    return {
      status: 200,
      body: {
        ok: true,
        correct: false,
        points: 0,
        streak: player.streak,
        weekPoints: player.weekPoints,
      },
    };
  }
  const judged = judge({
    issuedAt: q.issuedAt,
    now,
    limitMs: q.limitMs,
    used: q.used,
    choice,
    answer: q.answer,
    tier: q.tier,
    streak: player.streak,
  });
  if (judged.consume && !q.used) {
    q.used = true;
    await saveQuestion(kv, q);
    rememberSpent(player, q.id);
  }
  if (player.openId === q.id) player.openId = null;
  if (!judged.accepted) {
    player.streak = 0;
    await savePlayer(kv, playerId, player, now);
    return {
      status: 200,
      body: { ok: true, correct: false, points: 0, streak: 0, weekPoints: player.weekPoints },
    };
  }
  player.streak = judged.correct ? judged.streak : 0;
  if (judged.correct) player.weekPoints += judged.points;
  await savePlayer(kv, playerId, player, now);
  if (judged.correct) await putOnBoard(kv, player, playerId);
  return {
    status: 200,
    body: {
      ok: true,
      correct: judged.correct,
      points: judged.correct ? judged.points : 0,
      streak: player.streak,
      weekPoints: player.weekPoints,
    },
  };
}

export async function setHandle(kv, playerId, handle, show, now) {
  const player = await loadPlayer(kv, playerId, now);
  rollWeek(player, now);
  // Only a literal yes opts in. A missing flag, or the word "true", stays off
  // and does not keep a nickname.
  const want = show === true;
  if (!want) {
    player.handle = "";
    player.show = false;
    await savePlayer(kv, playerId, player, now);
    await takeOffBoard(kv, playerId, player.week);
    return { status: 200, body: { ok: true, handle: "", show: false } };
  }
  const cleaned = cleanHandle(handle);
  if (!cleaned.ok) return { status: 400, body: { ok: false, error: cleaned.error } };
  player.handle = cleaned.handle;
  player.show = true;
  await savePlayer(kv, playerId, player, now);
  await putOnBoard(kv, player, playerId);
  return { status: 200, body: { ok: true, handle: player.handle, show: true } };
}

export async function getBoard(kv, now) {
  const week = weekKey(new Date(now));
  const rows = await loadBoard(kv, week);
  const entries = [];
  for (const r of rows) {
    const h = cleanHandle(r.handle);
    if (!h.ok) continue;
    entries.push({ handle: h.handle, points: clampInt(r.points, 1000000) });
  }
  entries.sort((a, b) => b.points - a.points || a.handle.localeCompare(b.handle));
  return { status: 200, body: { ok: true, title: "This week", entries: entries.slice(0, BOARD_CAP) } };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readRequestJson(request) {
  let text = "";
  try { text = await request.text(); } catch { return { error: true }; }
  if (text.length > 4000) return { error: true };
  if (!text) return { json: {} };
  try { return { json: JSON.parse(text) }; } catch { return { error: true }; }
}

/**
 * HTTP entry. `now` is injectable so a test can move the week forward
 * without waiting. The browser never supplies the clock used for points.
 */
export async function dispatchChallenge(request, kv, now = Date.now(), rng = null) {
  if (!kv) {
    return jsonResponse({ ok: false, error: "Pip can't reach the challenge garden right now." }, 503);
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const random = rng || defaultRng();
  if (path === "/api/challenge/board" && request.method === "GET") {
    const out = await getBoard(kv, now);
    return jsonResponse(out.body, out.status);
  }
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Pip can't do that." }, 405);
  const parsed = await readRequestJson(request);
  if (parsed.error) return jsonResponse({ ok: false, error: "Pip can't do that." }, 400);
  const body = parsed.json || {};
  if (!validPlayerId(body.playerId)) {
    return jsonResponse({ ok: false, error: "Pip couldn't start that. The garden is right here." }, 400);
  }
  if (path === "/api/challenge/question") {
    const out = await issueQuestion(kv, body.playerId, now, random);
    return jsonResponse(out.body, out.status);
  }
  if (path === "/api/challenge/answer") {
    const choice = typeof body.choice === "string" ? body.choice : "";
    const questionId = typeof body.questionId === "string" && /^[a-z0-9]{8,24}$/.test(body.questionId)
      ? body.questionId
      : "";
    const out = await answerQuestion(kv, body.playerId, questionId, choice, now);
    return jsonResponse(out.body, out.status);
  }
  if (path === "/api/challenge/name") {
    const out = await setHandle(kv, body.playerId, body.handle, body.show, now);
    return jsonResponse(out.body, out.status);
  }
  return jsonResponse({ ok: false, error: "Pip can't do that." }, 404);
}

export function memoryKv() {
  const m = new Map();
  return {
    async get(key) { return m.has(key) ? m.get(key) : null; },
    async put(key, value) { m.set(key, String(value)); },
    async delete(key) { m.delete(key); },
    raw(key) { return m.has(key) ? JSON.parse(m.get(key)) : null; },
  };
}
