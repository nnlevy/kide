// HTTP for challenge mode. Points are figured in score.js from this clock.

import {
  validPlayerId, validQuestionId, defaultRng,
} from "./score.js";
import {
  issueQuestion, answerQuestion, setHandle, getBoard,
} from "./board.js";
import { parentIdFrom } from "./account.js";

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const GARDEN = "Pip can't reach the challenge garden right now.";

async function readJson(request) {
  let text = "";
  try { text = await request.text(); } catch { return { error: true }; }
  if (text.length > 4000) return { error: true };
  if (!text) return { json: {} };
  try { return { json: JSON.parse(text) }; } catch { return { error: true }; }
}

function databaseOf(dbOrEnv) {
  if (dbOrEnv && typeof dbOrEnv.prepare === "function") return dbOrEnv;
  if (dbOrEnv && dbOrEnv.DB && typeof dbOrEnv.DB.prepare === "function") return dbOrEnv.DB;
  return null;
}

function sessionEnv(dbOrEnv, db) {
  if (dbOrEnv && (dbOrEnv.PORTFOLIO_MESSAGING_SERVICE || dbOrEnv.DB)) {
    return dbOrEnv.DB ? dbOrEnv : { ...dbOrEnv, DB: db };
  }
  return { DB: db };
}

export async function handleCompete(request, dbOrEnv, now = Date.now(), rng = null) {
  const db = databaseOf(dbOrEnv);
  if (!db) return json({ ok: false, message: GARDEN }, 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const random = rng || defaultRng();
  try {
    if (path === "/api/compete/board" && request.method === "GET") {
      const out = await getBoard(db, now);
      return json(out.body, out.status);
    }
    if (request.method !== "POST") return json({ ok: false, message: "Pip can't do that." }, 405);
    const parsed = await readJson(request);
    if (parsed.error) return json({ ok: false, message: "Pip can't do that." }, 400);
    const body = parsed.json || {};
    if (!validPlayerId(body.playerId)) {
      return json({ ok: false, message: "Pip couldn't start that. The garden is right here." }, 400);
    }
    const accountId = await parentIdFrom(request, sessionEnv(dbOrEnv, db));
    if (path === "/api/compete/question") {
      const out = await issueQuestion(db, body.playerId, now, random, accountId);
      return json(out.body, out.status);
    }
    if (path === "/api/compete/answer") {
      const choice = typeof body.choice === "string" ? body.choice : "";
      const questionId = validQuestionId(body.questionId) ? body.questionId : "";
      const out = await answerQuestion(db, body.playerId, questionId, choice, now, accountId);
      return json(out.body, out.status);
    }
    if (path === "/api/compete/name") {
      const out = await setHandle(db, body.playerId, body.handle, body.show, now, accountId);
      return json(out.body, out.status);
    }
    return json({ ok: false, message: "Pip can't do that." }, 404);
  } catch {
    return json({ ok: false, message: GARDEN }, 503);
  }
}
