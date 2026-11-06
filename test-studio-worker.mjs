// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Worker fetch coverage. MOCKED: messaging, getCredits, AI, test-only fixture.
// ACTUAL: the Worker fetch in src/worker/index.ts, studio routes, and sqlite D1.
// No live hub, Stripe, AI, email, or OTP. STUDIO_MONTHLY_FIXTURE is not a reader.

import { register } from "node:module";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";

register("./test-studio-worker-hook.mjs", { parentURL: import.meta.url });
const worker = (await import("./src/worker/index.ts")).default;

const PARENT_A = "parent-a@example.com";
const PARENT_B = "parent-b@example.com";
const FUTURE = () => new Date(Date.now() + 14 * 864e5).toISOString();
const PAST = () => new Date(Date.now() - 14 * 864e5).toISOString();

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    pass += 1;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e.message}`);
    fail += 1;
  }
};

function d1() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          const info = stmt.run(...this.args);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowId } };
        },
        async first() { return stmt.get(...this.args) || null; },
        async all() { return { results: stmt.all(...this.args) }; },
      };
    },
    batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
  };
}

function record(email, overrides = {}) {
  return {
    ok: true,
    email,
    domain: "kide.us",
    offeringId: "lesson_studio_monthly",
    status: "active",
    currentPeriodEnd: FUTURE(),
    ...overrides,
  };
}

function lessonJson() {
  return JSON.stringify({
    beats: [
      { word: "rope", affordance: "GAP" },
      { word: "ribbon", affordance: "REACH" },
      { word: "sun", affordance: "DARK" },
      { word: "stick", affordance: "GAP" },
    ],
  });
}

function envFor({ db = d1(), credits, ai, records, snapshot, session } = {}) {
  const billing = {
    async getCredits(email) {
      if (typeof credits === "function") return credits(email);
      if (credits) return credits;
      return {
        ok: true,
        exists: true,
        email,
        creditsBalance: 0,
        summaries: [{ domain: "kide.us", creditsPurchased: 1 }],
        purchases: [{ domain: "kide.us", offeringId: "lesson_studio_monthly", sourceRef: "cs_hist", status: "paid" }],
      };
    },
  };
  const env = {
    DB: db,
    KIDE_LEADS: {},
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
    PORTFOLIO_MESSAGING_SERVICE: {
      async currentSession(input) {
        if (session) return session(input);
        const cookie = input && input.session;
        if (String(cookie).includes("parent-a")) return { ok: true, email: PARENT_A };
        if (String(cookie).includes("parent-b")) return { ok: true, email: PARENT_B };
        return { ok: false };
      },
    },
    PORTFOLIO_BILLING_SERVICE: billing,
    PORTFOLIO_AI_SERVICE: ai || {
      async createChatCompletion() {
        return { ok: true, data: { choices: [{ message: { content: lessonJson() } }] } };
      },
    },
  };
  if (records) env.STUDIO_MONTHLY_FIXTURE = { testOnly: true, records };
  if (snapshot) env.STUDIO_MONTHLY_SNAPSHOT = snapshot;
  return env;
}

function call(env, path, { method = "GET", cookie, body, headers = {} } = {}) {
  const all = { ...headers };
  if (cookie) all.cookie = `__Host-rft_session=${cookie}`;
  return worker.fetch(new Request(`https://kide.us${path}`, {
    method,
    headers: all,
    body: body == null ? undefined : JSON.stringify(body),
  }), env);
}

async function read(res) {
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  return { status: res.status, data, text };
}

const chatBody = { ageBand: "4-5", skillGaps: ["r_initial", "s_initial"] };

console.log("\nlesson studio worker fetch");
console.log("  (MOCKED bindings and test-only fixture; ACTUAL worker.fetch)");

await t("Worker fetch: receipts and a process-wide snapshot do not enable either parent", async () => {
  const env = envFor({ snapshot: record(PARENT_A) });
  const a = await read(await call(env, "/api/studio/status", { cookie: "parent-a" }));
  const b = await read(await call(env, "/api/studio/status", { cookie: "parent-b" }));
  assert.equal(a.status, 200);
  assert.equal(a.data.enabled, false);
  assert.equal(a.data.state, "closed");
  assert.equal(b.data.enabled, false);
});

await t("Worker fetch: fixture is per authenticated parent, domain, and offering", async () => {
  const env = envFor({ records: { [PARENT_A]: record(PARENT_A), [PARENT_B]: record(PARENT_B, { offeringId: "family_unlock" }) } });
  const a = await read(await call(env, "/api/studio/status", { cookie: "parent-a" }));
  const b = await read(await call(env, "/api/studio/status", { cookie: "parent-b" }));
  assert.equal(a.data.enabled, true);
  assert.equal(b.data.enabled, false);
  const bare = record(PARENT_A);
  delete bare.domain;
  const missing = envFor({ records: { [PARENT_A]: bare } });
  const noDomain = await read(await call(missing, "/api/studio/status", { cookie: "parent-a" }));
  assert.equal(noDomain.data.enabled, false);
  const swapped = envFor({ records: { [PARENT_A]: record(PARENT_B) } });
  const foreign = await read(await call(swapped, "/api/studio/status", { cookie: "parent-a" }));
  assert.equal(foreign.data.enabled, false);
});

await t("Worker fetch: owned approved play and delete survive a closed or failed billing read", async () => {
  const db = d1();
  const open = envFor({ db, records: { [PARENT_A]: record(PARENT_A), [PARENT_B]: record(PARENT_B) } });
  const made = await read(await call(open, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const id = made.data.lesson.id;
  const approved = await read(await call(open, "/api/studio/approve", {
    method: "POST", cookie: "parent-a", body: { id },
  }));
  assert.equal(approved.status, 200);

  const expired = envFor({ db, records: { [PARENT_A]: record(PARENT_A, { currentPeriodEnd: PAST() }) } });
  const play = await read(await call(expired, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(play.status, 200);
  const list = await read(await call(expired, "/api/studio/playlist", { cookie: "parent-a" }));
  assert.equal(list.data.lessons.length, 1);
  const stolen = await read(await call(expired, `/api/studio/play?id=${id}`, { cookie: "parent-b" }));
  assert.equal(stolen.status, 404);
  const chat = await read(await call(expired, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(chat.status, 403);
  assert.equal(chat.data.state, "closed");

  const down = envFor({ db, credits: () => { throw new Error("hub down"); } });
  const unknown = await read(await call(down, "/api/studio/status", { cookie: "parent-a" }));
  assert.equal(unknown.status, 503);
  assert.equal(unknown.data.state, "unknown");
  const still = await read(await call(down, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(still.status, 200);
  const cleared = await read(await call(down, "/api/studio/clear", { method: "POST", cookie: "parent-a", body: {} }));
  assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
  assert.equal(cleared.data.ok, true);
  const after = await read(await call(down, "/api/studio/playlist", { cookie: "parent-a" }));
  assert.deepEqual(after.data.lessons, []);
  const other = await read(await call(open, "/api/studio/playlist", { cookie: "parent-b" }));
  assert.deepEqual(other.data.lessons, []);
});

await t("Worker fetch: cross-origin mutation does not delete; a same-origin cookie still can", async () => {
  const db = d1();
  const env = envFor({ db, records: { [PARENT_A]: record(PARENT_A) } });
  const made = await read(await call(env, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  const id = made.data.lesson.id;
  await call(env, "/api/studio/approve", { method: "POST", cookie: "parent-a", body: { id } });
  const blocked = await read(await call(env, "/api/studio/clear", {
    method: "POST",
    cookie: "parent-a",
    body: {},
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  }));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, "forbidden");
  const kept = await read(await call(env, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(kept.status, 200);
  const allowed = await read(await call(env, "/api/studio/clear", {
    method: "POST",
    cookie: "parent-a",
    body: {},
    headers: { origin: "https://kide.us", "sec-fetch-site": "same-origin" },
  }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.ok, true);
});

await t("Worker fetch: overlapping chats take one lease, and a failed try does not spend a lesson", async () => {
  const db = d1();
  let started = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const env = envFor({
    db,
    records: { [PARENT_A]: record(PARENT_A) },
    ai: {
      async createChatCompletion() {
        started += 1;
        if (started === 1) await gate;
        if (started === 2) throw new Error("ai down");
        return { ok: true, data: { choices: [{ message: { content: lessonJson() } }] } };
      },
    },
  });
  const first = call(env, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody });
  for (let i = 0; i < 50 && started < 1; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(started, 1);
  const second = await read(await call(env, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(second.status, 429, JSON.stringify(second.data));
  assert.equal(second.data.error, "in_flight");
  release();
  const one = await read(await first);
  assert.equal(one.status, 200, JSON.stringify(one.data));
  const row = await db.prepare(
    `SELECT generated, attempts, inflight FROM kide_studio_quota`,
  ).all();
  assert.equal(row.results[0].generated, 1);
  assert.equal(row.results[0].inflight, 0);

  const again = await read(await call(env, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(again.status, 503);
  const after = await db.prepare(`SELECT generated, attempts FROM kide_studio_quota`).all();
  assert.equal(after.results[0].generated, 1);
  assert.ok(after.results[0].attempts >= 2);
});

await t("Worker fetch: session email is owner identity only; a failed read deletes nothing", async () => {
  const db = d1();
  const seen = [];
  const open = envFor({
    db,
    records: { [PARENT_A]: record(PARENT_A) },
    session(input) {
      seen.push(input);
      return { ok: true, email: PARENT_A, verifiedParentEmail: false };
    },
  });
  const made = await read(await call(open, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const id = made.data.lesson.id;
  assert.equal((await read(await call(open, "/api/studio/approve", {
    method: "POST", cookie: "parent-a", body: { id },
  }))).status, 200);
  assert.equal(seen[0].domain, "kide.us");
  assert.match(String(seen[0].session), /__Host-rft_session=parent-a/);
  assert.equal(seen[0].request, undefined);

  const before = await db.prepare(`SELECT id FROM kide_lessons`).all();
  const down = envFor({
    db,
    session() { return { ok: false, error: "storage_error", message: "Something went wrong. Try again in a moment." }; },
  });
  const cleared = await read(await call(down, "/api/studio/clear", { method: "POST", cookie: "parent-a", body: {} }));
  assert.equal(cleared.status, 503);
  assert.equal(cleared.data.error, "identity_unavailable");
  assert.equal(cleared.data.ok, false);
  const play = await read(await call(down, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(play.status, 404);
  const list = await read(await call(down, "/api/studio/playlist", { cookie: "parent-a" }));
  assert.deepEqual(list.data.lessons, []);
  const afterDown = await db.prepare(`SELECT id FROM kide_lessons`).all();
  assert.equal(afterDown.results.length, before.results.length);

  const expired = envFor({ db, session() { return { ok: false }; } });
  const expiredClear = await read(await call(expired, "/api/studio/clear", { method: "POST", cookie: "parent-a", body: {} }));
  assert.equal(expiredClear.status, 403);
  assert.notEqual(expiredClear.data.error, "identity_unavailable");
  const still = await db.prepare(`SELECT id FROM kide_lessons`).all();
  assert.equal(still.results.length, 1);

  const flagOnly = envFor({
    db,
    session() { return { ok: true, verifiedParentEmail: true }; },
  });
  const noEmail = await read(await call(flagOnly, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(noEmail.status, 404);

  const owned = await read(await call(open, `/api/studio/play?id=${id}`, { cookie: "parent-a" }));
  assert.equal(owned.status, 200);
  const other = envFor({
    db,
    session() { return { ok: true, email: PARENT_B }; },
  });
  assert.equal((await read(await call(other, `/api/studio/play?id=${id}`, { cookie: "parent-b" }))).status, 404);
  const otherClear = await read(await call(other, "/api/studio/clear", { method: "POST", cookie: "parent-b", body: {} }));
  assert.equal(otherClear.status, 200);
  assert.equal((await db.prepare(`SELECT id FROM kide_lessons`).all()).results.length, 1);
});

await t("Worker fetch: a thrown lesson delete stays signed in and keeps the row", async () => {
  const db = d1();
  let armed = false;
  const wrapped = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrappedStmt = {
        bind(...args) { stmt.bind(...args); return wrappedStmt; },
        async run() {
          if (armed && /DELETE FROM kide_lessons/i.test(sql)) throw new Error("d1 delete threw");
          return stmt.run();
        },
        async first() { return stmt.first(); },
        async all() { return stmt.all(); },
      };
      return wrappedStmt;
    },
    batch(stmts) { return db.batch(stmts); },
  };
  const env = envFor({
    db: wrapped,
    records: { [PARENT_A]: record(PARENT_A) },
  });
  const made = await read(await call(env, "/api/studio/chat", { method: "POST", cookie: "parent-a", body: chatBody }));
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.equal((await db.prepare(`SELECT id FROM kide_lessons`).all()).results.length, 1);
  armed = true;
  const cleared = await read(await call(env, "/api/studio/clear", { method: "POST", cookie: "parent-a", body: {} }));
  assert.equal(cleared.status, 500);
  assert.equal(cleared.data.ok, false);
  assert.equal(cleared.data.signedIn, true);
  assert.equal(cleared.data.error, "delete_failed");
  assert.equal((await db.prepare(`SELECT id FROM kide_lessons`).all()).results.length, 1);
  armed = false;
  const again = await read(await call(env, "/api/studio/clear", { method: "POST", cookie: "parent-a", body: {} }));
  assert.equal(again.status, 200);
  assert.equal(again.data.ok, true);
  assert.equal(again.data.signedIn, true);
  assert.deepEqual(again.data.lessons, []);
  assert.equal((await db.prepare(`SELECT id FROM kide_lessons`).all()).results.length, 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
