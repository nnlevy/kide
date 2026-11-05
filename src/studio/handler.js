// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// /parent/studio talks to these routes. Checkout is not opened here.
// Pending lessons stay off the playlist a child can open.

import { AGE_BANDS, skillGapCatalog, screenChat } from "../../public/studio/schema.js";
import {
  CHECKOUT,
  COMING_SOON_MESSAGE,
  OFFERING_ID,
  REFUSED_MESSAGE,
  readStudioParent,
  studioEntitlement,
  studioView,
} from "./access.js";
import { proposeLesson } from "./generate.js";
import { approveLesson, getLesson, insertLesson, listLessons, newLessonId } from "./store.js";

const MAX_BODY = 4000;

const ROUTES = {
  "/api/studio/status": "GET",
  "/api/studio/chat": "POST",
  "/api/studio/lessons": "GET",
  "/api/studio/approve": "POST",
  "/api/studio/playlist": "GET",
  "/api/studio/play": "GET",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function closed(view) {
  return json({
    ok: false,
    enabled: false,
    state: view.body.state,
    checkout: CHECKOUT,
    offeringId: OFFERING_ID,
    message: view.body.message,
  }, view.http === 200 ? 403 : view.http);
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: "big" };
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad" };
    return body;
  } catch {
    return { error: "bad" };
  }
}

function parentLesson(lesson) {
  return {
    id: lesson.id,
    status: lesson.status,
    title: lesson.title,
    ageBand: lesson.ageBand,
    skillGaps: lesson.skillGaps,
    beats: lesson.beats,
    createdAt: lesson.createdAt,
    approvedAt: lesson.approvedAt,
  };
}

function playlistItem(lesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    ageBand: lesson.ageBand,
    skillGaps: lesson.skillGaps,
  };
}

export async function handleStudio(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!(path in ROUTES)) return json({ ok: false, error: "not_found" }, 404);
  const method = request.method === "HEAD" && ROUTES[path] === "GET" ? "GET" : request.method;
  if (method !== ROUTES[path]) return json({ ok: false, error: "method_not_allowed" }, 405);

  const parent = await readStudioParent(request, env);
  const signedIn = Boolean(parent.parentId && parent.email);
  const entitlement = signedIn ? await studioEntitlement(env, parent.email) : { known: true, enabled: false };
  const view = studioView({ signedIn, entitlement: signedIn ? entitlement : { known: true, enabled: false } });

  if (path === "/api/studio/status") {
    const body = { ...view.body };
    if (body.enabled) {
      body.ageBands = Object.keys(AGE_BANDS);
      body.skillGaps = skillGapCatalog();
    }
    return json(body, view.http);
  }

  if (path === "/api/studio/chat") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, error: "bad_request" }, 400);
    const screen = screenChat(body);
    if (!screen.ok && screen.error === "refused") {
      return json({ ok: false, error: "refused", message: REFUSED_MESSAGE }, 400);
    }
    if (!view.body.enabled) return closed(view);
    if (!screen.ok) return json({ ok: false, error: "bad_request" }, 400);
    if (!env || !env.DB) return json({ ok: false, error: "storage_unavailable" }, 503);
    const proposed = await proposeLesson(env.PORTFOLIO_AI_SERVICE, {
      ageBand: screen.ageBand,
      skillGaps: screen.skillGaps,
    });
    if (!proposed.ok) {
      const status = proposed.error === "invalid_lesson" ? 422 : 503;
      return json({ ok: false, error: proposed.error }, status);
    }
    const id = newLessonId();
    const now = new Date().toISOString();
    await insertLesson(env.DB, { id, parentId: parent.parentId, lesson: proposed.lesson, now });
    const stored = await getLesson(env.DB, parent.parentId, id);
    return json({ ok: true, lesson: parentLesson(stored) });
  }

  if (!view.body.enabled) return closed(view);
  if (!env || !env.DB) return json({ ok: false, error: "storage_unavailable" }, 503);

  if (path === "/api/studio/lessons") {
    const rows = await listLessons(env.DB, parent.parentId, { approvedOnly: false });
    return json({ ok: true, enabled: true, lessons: rows.map(parentLesson) });
  }

  if (path === "/api/studio/approve") {
    const body = await readJson(request);
    if (body.error || typeof body.id !== "string" || !body.id) {
      return json({ ok: false, error: "bad_request" }, 400);
    }
    const result = await approveLesson(env.DB, parent.parentId, body.id, new Date().toISOString());
    if (!result.ok) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, lesson: parentLesson(result.lesson) });
  }

  if (path === "/api/studio/playlist") {
    const rows = await listLessons(env.DB, parent.parentId, { approvedOnly: true });
    return json({
      ok: true,
      enabled: true,
      lessons: rows.map(playlistItem),
    });
  }

  const id = url.searchParams.get("id") || "";
  if (!id) return json({ ok: false, error: "bad_request" }, 400);
  const lesson = await getLesson(env.DB, parent.parentId, id);
  if (!lesson || lesson.status !== "approved") return json({ ok: false, error: "not_found" }, 404);
  return json({
    ok: true,
    lesson: {
      version: lesson.version,
      title: lesson.title,
      ageBand: lesson.ageBand,
      skillGaps: lesson.skillGaps,
      beats: lesson.beats,
    },
  });
}

export { COMING_SOON_MESSAGE };
