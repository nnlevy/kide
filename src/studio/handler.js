// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// /parent/studio talks to these routes. Checkout is not opened here.
// Pending lessons stay off the playlist a child can open.
// Playlist/play never carry checkout, offering, or status jargon.

import { AGE_BANDS, skillGapCatalog, screenChat } from "../../public/studio/schema.js";
import {
  CHILD_ASK_GROWNUP,
  REFUSED_MESSAGE,
  readStudioParent,
  studioEntitlement,
  studioView,
} from "./access.js";
import { proposeLesson } from "./generate.js";
import {
  STUDIO_HOUR_CAP,
  approveLesson,
  beginGenerate,
  commitGenerate,
  deleteLesson,
  deleteLessons,
  getLesson,
  insertLesson,
  listLessons,
  newLessonId,
  releaseGenerate,
} from "./store.js";

const MAX_BODY = 4000;

const ROUTES = {
  "/api/studio/status": "GET",
  "/api/studio/chat": "POST",
  "/api/studio/lessons": "GET",
  "/api/studio/approve": "POST",
  "/api/studio/clear": "POST",
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

function parentClosed(view) {
  return json({
    ok: false,
    enabled: false,
    signedIn: view.body.signedIn === true,
    state: view.body.state,
    message: view.body.message,
  }, view.http === 200 ? 403 : view.http);
}

function limitMessage(error) {
  if (error === "in_flight") return "A lesson is already being made. Try again in a little while.";
  if (error === "lesson_cap") return `${STUDIO_HOUR_CAP} lessons are enough for this hour. Try again later.`;
  if (error === "attempt_cap") return "That was too many tries for this hour. Try again later.";
  return "Try again in a little while.";
}

// A browser that sends a cross-origin marker on a mutation is refused.
// A missing Origin is not treated as proof of a forged request: the session
// cookie is host-only and SameSite=Strict, and this check does not replace that.
function foreignMutation(request) {
  const site = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

function childPlaylist() {
  return json({ ok: true, lessons: [] });
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
  if (!(path in ROUTES)) return json({ ok: false }, 404);
  const method = request.method === "HEAD" && ROUTES[path] === "GET" ? "GET" : request.method;
  if (method !== ROUTES[path]) return json({ ok: false }, 405);
  if (method === "POST" && foreignMutation(request)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const parent = await readStudioParent(request, env);
  if (parent.identity === "unavailable") {
    if (path === "/api/studio/playlist") return childPlaylist();
    if (path === "/api/studio/play") return json({ ok: false }, 404);
    return json({
      ok: false,
      enabled: false,
      signedIn: false,
      error: "identity_unavailable",
      message: "We could not check just now. Try again in a little while. This page does not ask you to pay.",
    }, 503);
  }
  const signedIn = parent.identity === "ready" && Boolean(parent.parentId && parent.email);
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

  if (path === "/api/studio/playlist") {
    // Owned approved lessons stay playable after generation eligibility ends,
    // and when the hub cannot be read. Identity is required. A failed billing
    // read is not treated as an empty family.
    if (!signedIn || !env || !env.DB) return childPlaylist();
    const rows = await listLessons(env.DB, parent.parentId, { approvedOnly: true });
    return json({ ok: true, lessons: rows.map(playlistItem) });
  }

  if (path === "/api/studio/play") {
    if (!signedIn || !env || !env.DB) return json({ ok: false }, 404);
    const id = url.searchParams.get("id") || "";
    if (!id) return json({ ok: false }, 404);
    const lesson = await getLesson(env.DB, parent.parentId, id);
    if (!lesson || lesson.status !== "approved") return json({ ok: false }, 404);
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

  if (path === "/api/studio/chat") {
    const body = await readJson(request);
    if (body.error) return json({ ok: false, error: "bad_request" }, 400);
    const screen = screenChat(body);
    if (!screen.ok && screen.error === "refused") {
      return json({ ok: false, error: "refused", message: REFUSED_MESSAGE }, 400);
    }
    if (!view.body.enabled) return parentClosed(view);
    if (!screen.ok) return json({ ok: false, error: "bad_request" }, 400);
    if (!env || !env.DB) return json({ ok: false, error: "unavailable" }, 503);
    const slot = await beginGenerate(env.DB, parent.parentId);
    if (!slot.ok) {
      return json({ ok: false, error: slot.error, message: limitMessage(slot.error) }, 429);
    }
    let committed = false;
    let storedId = null;
    try {
      const proposed = await proposeLesson(env.PORTFOLIO_AI_SERVICE, {
        ageBand: screen.ageBand,
        skillGaps: screen.skillGaps,
      });
      if (!proposed.ok) {
        const status = proposed.error === "invalid_lesson" ? 422 : 503;
        return json({ ok: false, error: proposed.error }, status);
      }
      storedId = newLessonId();
      const now = new Date().toISOString();
      await insertLesson(env.DB, { id: storedId, parentId: parent.parentId, lesson: proposed.lesson, now });
      committed = await commitGenerate(env.DB, parent.parentId, slot.token);
      if (!committed) {
        return json({ ok: false, error: "in_flight", message: limitMessage("in_flight") }, 429);
      }
      const stored = await getLesson(env.DB, parent.parentId, storedId);
      return json({ ok: true, lesson: parentLesson(stored) });
    } finally {
      if (!committed) {
        if (storedId) await deleteLesson(env.DB, parent.parentId, storedId);
        await releaseGenerate(env.DB, parent.parentId, slot.token);
      }
    }
  }

  if (!signedIn) return parentClosed(view);
  if (!env || !env.DB) return json({ ok: false, error: "unavailable", signedIn: true }, 503);

  if (path === "/api/studio/lessons") {
    const rows = await listLessons(env.DB, parent.parentId, { approvedOnly: false });
    return json({ ok: true, enabled: view.body.enabled === true, lessons: rows.map(parentLesson) });
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

  if (path === "/api/studio/clear") {
    // A thrown delete is a service failure for this signed-in parent. It is
    // not a sign-out. Success is only a count of zero lesson rows afterward.
    try {
      await deleteLessons(env.DB, parent.parentId);
    } catch { /* the count below decides whether anything was actually cleared */ }
    let left;
    try {
      left = await listLessons(env.DB, parent.parentId, { approvedOnly: false });
    } catch {
      return json({ ok: false, signedIn: true, error: "delete_failed" }, 500);
    }
    if (left.length !== 0) {
      return json({ ok: false, signedIn: true, error: "delete_failed" }, 500);
    }
    return json({ ok: true, signedIn: true, lessons: [] });
  }

  return json({ ok: false }, 404);
}

export { CHILD_ASK_GROWNUP };
