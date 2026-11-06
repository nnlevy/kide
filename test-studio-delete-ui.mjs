// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Rendered /parent Delete everything against the real Worker fetch and sqlite D1.
// MOCKED: messaging and the test-only monthly fixture. No live hub, Stripe, or AI spend
// beyond the local lesson fixture the Worker already accepts.
// A failed delete must not clear the on-device journal or tell a signed-in parent to sign in.

import { register } from "node:module";
import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { browserOrSkip } from "./test-browser.mjs";

register("./test-studio-worker-hook.mjs", { parentURL: import.meta.url });
const worker = (await import("./src/worker/index.ts")).default;

const PORT = Number(process.env.STUDIO_DELETE_UI_PORT || 9166);
const BASE = `http://127.0.0.1:${PORT}`;
const PARENT_A = "parent-a@example.com";
const OUT = "/tmp/kide-pr22-delete-ui";
fs.mkdirSync(OUT, { recursive: true });

function d1() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          if (armed && /DELETE FROM kide_lessons/i.test(sql)) throw new Error("d1 delete threw");
          const info = stmt.run(...this.args);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowId } };
        },
        async first() { return stmt.get(...this.args) || null; },
        async all() { return { results: stmt.all(...this.args) }; },
      };
    },
    batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
    count() { return sqlite.prepare(`SELECT COUNT(*) AS n FROM kide_lessons`).get().n; },
  };
}

let armed = false;
let mode = "worker";
let sessionMode = "parent-a";
const db = d1();

const env = {
  DB: db,
  KIDE_LEADS: {},
  ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  STUDIO_MONTHLY_FIXTURE: {
    testOnly: true,
    records: {
      [PARENT_A]: {
        ok: true,
        email: PARENT_A,
        domain: "kide.us",
        offeringId: "lesson_studio_monthly",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 14 * 864e5).toISOString(),
      },
    },
  },
  PORTFOLIO_MESSAGING_SERVICE: {
    async currentSession(input) {
      if (sessionMode === "storage") return { ok: false, error: "storage_error" };
      if (sessionMode === "signed-out") return { ok: false };
      if (String(input && input.session).includes("parent-a")) return { ok: true, email: PARENT_A };
      return { ok: false };
    },
  },
  PORTFOLIO_BILLING_SERVICE: { async getCredits() { return { ok: true, purchases: [] }; } },
  PORTFOLIO_AI_SERVICE: {
    async createChatCompletion() {
      return {
        ok: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                beats: [
                  { word: "rope", affordance: "GAP" },
                  { word: "ribbon", affordance: "REACH" },
                  { word: "sun", affordance: "DARK" },
                  { word: "stick", affordance: "GAP" },
                ],
              }),
            },
          }],
        },
      };
    },
  },
};

function lessonJsonBody() {
  return JSON.stringify({ ageBand: "4-5", skillGaps: ["r_initial", "s_initial"] });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function staticFile(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  const clean = rel.endsWith("/") ? `${rel}index.html` : rel;
  const full = path.join(process.cwd(), "public", clean);
  const root = path.join(process.cwd(), "public");
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    if (url.pathname.startsWith("/api/")) {
      if (mode === "http500") {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("edge failure");
        return;
      }
      if (mode === "drop") {
        req.socket.destroy();
        return;
      }
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
      const response = await worker.fetch(new Request(`${BASE}${url.pathname}${url.search}`, {
        method: req.method,
        headers: req.headers,
        body,
      }), env);
      const bytes = Buffer.from(await response.arrayBuffer());
      const headers = { "content-type": response.headers.get("content-type") || "application/json" };
      res.writeHead(response.status, headers);
      res.end(bytes);
      return;
    }
    const file = staticFile(url.pathname);
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err && err.message || err));
  }
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const made = await worker.fetch(new Request(`${BASE}/api/studio/chat`, {
  method: "POST",
  headers: { cookie: "__Host-rft_session=parent-a", "content-type": "application/json" },
  body: lessonJsonBody(),
}), env);
const madeJson = await made.json();
assert.equal(made.status, 200, JSON.stringify(madeJson));
assert.equal(db.count(), 1);

const chromium = await browserOrSkip("test-studio-delete-ui");
const browser = await chromium.launch({ args: ["--no-sandbox"] });

const JOURNAL = JSON.stringify({
  v: 1,
  events: [{
    at: Date.now(),
    target: "r_initial",
    word: "rope",
    tier: "native",
    verdict: "clear",
    forced: false,
    level: 1,
    surface: "words",
  }],
});

async function openParent({ cookie, width }) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    extraHTTPHeaders: cookie ? { cookie } : {},
  });
  await context.addInitScript((raw) => {
    localStorage.setItem("kide_practice_journal_v1", raw);
  }, JOURNAL);
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(`${BASE}/parent/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#btnClear");
  return { context, page, errors };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

async function clickClear(page) {
  await page.click("#btnClear");
  await page.waitForFunction(() => {
    const note = document.querySelector("#storageNote");
    const out = document.querySelector("#linkOut");
    return note && out && (out.textContent.length > 0 || /0 practice moments/.test(note.textContent));
  });
}

const results = [];

async function runCase(name, setup, expect) {
  Object.assign({ mode, sessionMode, armed }, setup);
  mode = setup.mode;
  sessionMode = setup.sessionMode;
  armed = setup.armed;
  const { context, page, errors } = await openParent({ cookie: setup.cookie, width: setup.width });
  const before = await page.locator("#storageNote").innerText();
  assert.match(before, /1 practice moments/, `${name} journal before`);
  await clickClear(page);
  const link = await page.locator("#linkOut").innerText();
  const note = await page.locator("#storageNote").innerText();
  const narrative = await page.locator("#narrative").innerText();
  await shot(page, `${name}-${setup.width}.png`);
  assert.equal(link, expect.link, `${name} linkOut was ${JSON.stringify(link)}`);
  assert.match(note, expect.note, `${name} note ${note}`);
  if (expect.narrative) assert.match(narrative, expect.narrative, narrative);
  assert.equal(db.count(), expect.lessons, `${name} lessons`);
  assert.deepEqual(errors, [], `${name} page errors ${errors.join(" | ")}`);
  results.push({ name, link, note, lessons: db.count(), width: setup.width });
  await context.close();
}

const still = "The Lesson Studio lessons on this account are still there.";
const later = "Lesson Studio lessons on the account could not be deleted just now.";
const signIn = "Sign in before Lesson Studio lessons on the account can be deleted.";
const signedCookie = "__Host-rft_session=parent-a";

await runCase("d1-throw", {
  mode: "worker", sessionMode: "parent-a", armed: true, cookie: signedCookie, width: 390,
}, { link: still, note: /1 practice moments/, lessons: 1 });

await runCase("http500", {
  mode: "http500", sessionMode: "parent-a", armed: false, cookie: signedCookie, width: 1280,
}, { link: later, note: /1 practice moments/, lessons: 1 });

await runCase("identity-503", {
  mode: "worker", sessionMode: "storage", armed: false, cookie: signedCookie, width: 390,
}, { link: later, note: /1 practice moments/, lessons: 1 });

await runCase("signed-out", {
  mode: "worker", sessionMode: "signed-out", armed: false, cookie: "", width: 390,
}, { link: signIn, note: /1 practice moments/, lessons: 1 });

await runCase("dropped", {
  mode: "drop", sessionMode: "parent-a", armed: false, cookie: signedCookie, width: 390,
}, { link: later, note: /1 practice moments/, lessons: 1 });

await runCase("success", {
  mode: "worker", sessionMode: "parent-a", armed: false, cookie: signedCookie, width: 1280,
}, { link: "", note: /0 practice moments/, lessons: 0, narrative: /No practice recorded yet/ });

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log("\nstudio delete ui");
for (const row of results) console.log(`  ok   ${row.name} @${row.width} lessons=${row.lessons}`);
console.log(`\n${results.length} passed, 0 failed\n`);
