// Money path: tool use (Pip's Cast Club, grown-up corner) → paid step (family
// play adds more stories a day) → the existing $15 family unlock.
//
// POST /api/cast/story: tonight's bedtime story for a child with a cast.
//
// What arrives is ids from closed lists in public/cast/content.js (cast kind,
// leg or arm, colour, today's chips, one thing they love). Nothing a person
// typed, and never the child's name: the model writes CHILD where the name
// goes and the phone puts the name in. Anything outside the lists is dropped.
//
// What leaves is checked twice (here and on the phone) against BANNED, the
// list of words that would turn a bedtime story into medical advice. A hit is
// thrown away and the phone uses the story it can build on its own.

import { BANNED, COLORS, KINDS, LIKES, TODAY, WHERE, words } from "../../public/cast/content.js";
import { handleUnlock } from "../unlock/handler.js";

export const FREE_PER_DAY = 1;
export const FAMILY_PER_DAY = 3;
const MAX_BODY = 1000;
const DEVICE = /(?:^|;\s*)kide_device=([A-Za-z0-9_-]{22,80})/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Keep only ids that exist. Returns the request the model will see. */
export function cleanRequest(body) {
  const b = body && typeof body === "object" ? body : {};
  const kind = KINDS[b.kind] ? b.kind : "cast";
  const where = WHERE[b.where] ? b.where : "leg";
  const color = COLORS.some((c) => c.id === b.color) ? b.color : "blue";
  const todayIds = Array.isArray(b.today) ? b.today : [];
  const today = [...new Set(todayIds)].filter((id) => TODAY.some((t) => t.id === id)).slice(0, 3);
  const like = LIKES.some((l) => l.id === b.like) ? b.like : "";
  return { kind, where, color, crutches: b.crutches === true, today, like };
}

export function prompt(req) {
  const w = words(req);
  const todayLabels = req.today.map((id) => TODAY.find((t) => t.id === id).label);
  const likeLabel = req.like ? LIKES.find((l) => l.id === req.like).label : "";
  const system = [
    "You write very short, gentle bedtime stories for children aged 3 to 5 who are healing from a broken bone.",
    "The hero is Pip, a small green sprout who is patient, curious and a little sleepy. Pip has the same injury as the child, so they are a team.",
    "Write the child's name ONLY as the exact word CHILD. Never invent a name, age, gender or pronoun for the child; use CHILD or 'you'.",
    "HARD RULES, never break them:",
    "- No medical advice of any kind. Never mention medicine, pain relief, doses, exercises, stretching, putting weight on it, ice, surgery, hospital stays, or how long healing takes. No numbers of days or weeks.",
    "- Never promise a medical outcome. Doctors and grown-ups decide what happens next.",
    "- Nothing scary: no danger, no villains, no getting hurt again. Feelings like sad or grumpy are fine and are always comforted.",
    "- Simple words a 3 year old knows. Each page is one to three short sentences, under 220 characters.",
    "- End with Pip and CHILD getting cozy and sleepy.",
    "Reply with JSON only: {\"title\": string under 50 characters, \"pages\": array of 4 to 6 strings}.",
  ].join("\n");
  const user = JSON.stringify({
    injury: `${w.kind === "cast" || w.kind === "splint" ? `${w.color} ` : ""}${w.thing} on the ${w.part}`,
    crutches: req.crutches && w.part === "leg",
    today: todayLabels,
    loves: likeLabel,
  });
  return { system, user };
}

/** Check a model reply. Returns {title, pages} or null. */
export function checkStory(raw) {
  let d = raw;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch { return null; }
  }
  if (!d || typeof d.title !== "string" || !Array.isArray(d.pages)) return null;
  const title = d.title.trim().slice(0, 60);
  const pages = d.pages.filter((p) => typeof p === "string").map((p) => p.trim()).filter(Boolean);
  if (!title || pages.length < 3 || pages.length > 8) return null;
  if (pages.some((p) => p.length > 400)) return null;
  const all = [title, ...pages].join(" ");
  if (BANNED.test(all)) return null;
  if (/https?:|www\.|@|<|>/i.test(all)) return null;
  return { title, pages };
}

async function isUnlocked(request, env) {
  try {
    const url = new URL("/api/unlock/status", request.url);
    const res = await handleUnlock(new Request(url.toString(), { method: "GET", headers: request.headers }), env);
    const data = await res.json();
    return data && data.unlocked === true;
  } catch {
    return false;
  }
}

export async function handleCastStory(request, env, now = new Date()) {
  if (request.method !== "POST") return json({ ok: false, reason: "method" }, 405);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, reason: "big" }, 413);
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { return json({ ok: false, reason: "bad" }, 400); }
  const req = cleanRequest(body);

  const ai = env.PORTFOLIO_AI_SERVICE;
  if (!ai || typeof ai.createChatCompletion !== "function") return json({ ok: false, reason: "unavailable" }, 503);

  // A daily allowance per device. No device cookie (the grown-up corner sets it
  // through /api/unlock/status before asking) means no AI story, and the phone
  // writes one itself.
  const m = (request.headers.get("cookie") || "").match(DEVICE);
  if (!m) return json({ ok: false, reason: "nodevice" }, 400);
  const kv = env.KIDE_LEADS;
  const day = now.toISOString().slice(0, 10);
  const key = `cast:story:${day}:${m[1]}`;
  const used = kv ? Number((await kv.get(key)) || 0) : 0;
  const allowed = (await isUnlocked(request, env)) ? FAMILY_PER_DAY : FREE_PER_DAY;
  if (used >= allowed) return json({ ok: false, reason: "limit", allowed }, 429);

  const { system, user } = prompt(req);
  let story = null;
  try {
    const res = await ai.createChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = res && res.ok && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message
      ? res.data.choices[0].message.content
      : null;
    story = checkStory(content);
  } catch {
    story = null;
  }
  if (!story) return json({ ok: false, reason: "unusable" }, 502);
  if (kv) await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 36 });
  return json({ ok: true, title: story.title, pages: story.pages, left: Math.max(0, allowed - used - 1) });
}
