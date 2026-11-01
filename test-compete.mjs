// Challenge mode on the shared database: server clock, opt-in nicknames,
// and an account id that can be attached later.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  pointsFor, judge, tierForStreak, limitForTier, MIN_HUMAN_MS, weekKey, cleanHandle,
} from "./src/compete/score.js";
import { makeQuestion } from "./src/compete/questions.js";
import {
  issueQuestion, answerQuestion, setHandle, getBoard, linkAccount,
} from "./src/compete/board.js";
import { handleCompete } from "./src/compete/http.js";
import { parentIdFrom } from "./src/compete/account.js";
import { handlePlayEvents } from "./src/perf/http.js";

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " -- " + detail : ""}`); }
};
const eq = (name, actual, expected) => {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

function memoryDb() {
  const sqlite = new DatabaseSync(":memory:");
  const wrap = (sql, args) => {
    const stmt = sqlite.prepare(sql);
    const runArgs = args.length ? args : [];
    return {
      async run() {
        if (runArgs.length) stmt.run(...runArgs);
        else stmt.run();
        return { success: true };
      },
      async all() {
        const rows = runArgs.length ? stmt.all(...runArgs) : stmt.all();
        return { results: rows.map((row) => ({ ...row })) };
      },
      async first() {
        const row = runArgs.length ? stmt.get(...runArgs) : stmt.get();
        return row ? { ...row } : null;
      },
    };
  };
  return {
    prepare(sql) {
      const api = wrap(sql, []);
      api.bind = (...args) => wrap(sql, args);
      return api;
    },
    raw(sql, ...args) {
      const stmt = sqlite.prepare(sql);
      const row = args.length ? stmt.get(...args) : stmt.get();
      return row ? { ...row } : null;
    },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PID = "abcdef0123456789";
const NOW = Date.UTC(2026, 9, 31, 15, 0, 0);
const ACCOUNT = "parent_acct_01";

function signedEnv(db) {
  return {
    DB: db,
    PORTFOLIO_MESSAGING_SERVICE: {
      async currentSession() {
        return { ok: true, email: "parent@example.com" };
      },
    },
  };
}

console.log("\n--- points and the clock ---");

{
  eq("a new run starts at the hard tier", tierForStreak(0), 3);
  eq("three in a row steps up", tierForStreak(3), 4);
  eq("six in a row is the top", tierForStreak(6), 5);
  ok("the clock shrinks as the tier climbs", limitForTier(5) < limitForTier(4) && limitForTier(4) < limitForTier(3));
  const slow = pointsFor(3, 8000, 9000, 1);
  const fast = pointsFor(3, 500, 9000, 1);
  ok("a faster correct answer is worth more", fast > slow, `${fast} vs ${slow}`);
  ok("a harder tier is worth more", pointsFor(5, 500, 6000, 1) > fast);
  ok("a longer run is worth more", pointsFor(3, 500, 9000, 4) > fast);
  eq("the run bonus stops climbing", pointsFor(3, 500, 9000, 7), pointsFor(3, 500, 9000, 30));
}

{
  const issuedAt = NOW;
  const limitMs = 9000;
  const good = judge({
    issuedAt, now: issuedAt + 1000, limitMs, used: false,
    choice: "a", answer: "a", tier: 3, streak: 2,
  });
  eq("a real correct tap scores", good.correct, true);
  eq("points match the formula", good.points, pointsFor(3, 1000, limitMs, 3));
  const tooQuick = judge({
    issuedAt, now: issuedAt + (MIN_HUMAN_MS - 1), limitMs, used: false,
    choice: "a", answer: "a", tier: 5, streak: 9,
  });
  eq("a reply quicker than a person can move scores nothing", tooQuick.points, 0);
  eq("that reply is not accepted", tooQuick.accepted, false);
  const wrong = judge({
    issuedAt, now: issuedAt + 1200, limitMs, used: false,
    choice: "b", answer: "a", tier: 3, streak: 4,
  });
  eq("a miss ends the run", wrong.streak, 0);
}

console.log("--- questions get trickier ---");

{
  const easy = makeQuestion(3, mulberry32(3), NOW, "qqqqqqqqqqqqqqqqqq", "counting");
  const hard = makeQuestion(5, mulberry32(4), NOW, "rrrrrrrrrrrrrrrrrr", "counting");
  ok("tier 5 counts further than tier 3", hard.pub.count >= 6 && hard.pub.count <= 12, String(hard.pub.count));
  ok("tier 3 counting stays small", easy.pub.count >= 2 && easy.pub.count <= 5, String(easy.pub.count));
  ok("the public question has no answer", !Object.prototype.hasOwnProperty.call(easy.pub, "answer"));
  eq("the shorter clock is on the harder question", hard.pub.limitMs < easy.pub.limitMs, true);
  const shape = makeQuestion(4, mulberry32(8), NOW, "ssssssssssssssssss", "shapes");
  ok("from tier 4 a shape is a riddle", shape.pub.prompt.startsWith("Which"), shape.pub.prompt);
  const letters = makeQuestion(5, mulberry32(9), NOW, "tttttttttttttttttt", "letters");
  const labels = letters.pub.options.map((o) => o.label);
  const pairs = [["E", "F"], ["M", "W"], ["O", "Q"], ["P", "R"], ["C", "G"], ["V", "W"], ["B", "D"]];
  ok("tier 5 letters include a lookalike", pairs.some((p) => p.every((l) => labels.includes(l))), labels.join(","));
}

console.log("--- the board is opt-in, anonymous, and can take an account later ---");

{
  eq("an email nickname is refused", cleanHandle("pip@kide.us").ok, false);
  const db = memoryDb();
  const rng = mulberry32(11);
  const first = await issueQuestion(db, PID, NOW, rng);
  eq("a question is issued", first.status, 200);
  ok("the issued question does not carry the answer", first.body.question.answer === undefined);
  const secret = db.raw("SELECT * FROM kide_compete_questions WHERE id = ?", first.body.question.id);

  const sneaky = await handleCompete(new Request("http://kide.test/api/compete/answer", {
    method: "POST",
    body: JSON.stringify({
      playerId: PID,
      questionId: first.body.question.id,
      choice: secret.answer,
      points: 999999,
      elapsed: 1,
      streak: 40,
      now: NOW,
      email: "child@example.com",
      childName: "Sam",
      accountId: "parent_acct_01",
    }),
  }), db, NOW + 1000, rng);
  const scored = await sneaky.json();
  eq("the smuggled total is ignored", scored.points === 999999, false);
  eq("the score is the one computed here", scored.points, pointsFor(secret.tier, 1000, secret.limit_ms, 1));
  const stored = db.raw("SELECT * FROM kide_compete_players WHERE player_id = ?", PID);
  ok("no email was stored", !JSON.stringify(stored).includes("example.com"));
  ok("no child name was stored", !JSON.stringify(stored).includes("Sam"));
  eq("no account id yet", stored.account_id, null);

  const hidden = await getBoard(db, NOW + 1000);
  eq("the board stays empty until a grown-up opts in", hidden.body.entries.length, 0);

  const named = await setHandle(db, PID, "Sunny Oak", true, NOW + 1000);
  eq("the nickname is accepted", named.body.handle, "Sunny Oak");
  const shown = await getBoard(db, NOW + 1000);
  eq("the board shows the nickname", shown.body.entries[0].handle, "Sunny Oak");
  eq("and the points earned", shown.body.entries[0].points, scored.weekPoints);
  eq("the board row is a nickname and points", Object.keys(shown.body.entries[0]).sort().join(","), "handle,points");

  const linked = await linkAccount(db, PID, ACCOUNT, NOW + 1000);
  eq("an account id can be attached later", linked.linked, true);
  eq("the score row carries that id", db.raw("SELECT account_id FROM kide_scores WHERE player_id = ?", PID).account_id, ACCOUNT);
  const other = await linkAccount(db, PID, "other_parent_99", NOW + 1000);
  eq("a different account id does not replace it", other.linked, false);
  eq("the stored id is unchanged", db.raw("SELECT account_id FROM kide_compete_players WHERE player_id = ?", PID).account_id, ACCOUNT);

  const off = await setHandle(db, PID, "Sunny Oak", false, NOW + 1000);
  eq("turning it off drops the nickname", off.body.show, false);
  const gone = await getBoard(db, NOW + 1000);
  eq("the nickname leaves the board", gone.body.entries.length, 0);
  const wordy = await setHandle(db, PID, "Sunny Oak", "yes", NOW + 1000);
  eq("a word instead of yes stays off", wordy.body.show, false);
}

{
  const db = memoryDb();
  const rng = mulberry32(21);
  const issued = await issueQuestion(db, PID, NOW, rng);
  const id = issued.body.question.id;
  const secret = db.raw("SELECT * FROM kide_compete_questions WHERE id = ?", id);
  const quick = await answerQuestion(db, PID, id, secret.answer, NOW + 20);
  eq("a too-quick correct tap earns nothing", quick.body.points, 0);
  const again = await answerQuestion(db, PID, id, secret.answer, NOW + 2000);
  eq("that question cannot be retried more slowly", again.body.points, 0);

  const staleDb = memoryDb();
  const staleIssued = await issueQuestion(staleDb, PID, NOW, mulberry32(22));
  const staleId = staleIssued.body.question.id;
  const staleSecret = staleDb.raw("SELECT * FROM kide_compete_questions WHERE id = ?", staleId);
  await answerQuestion(staleDb, PID, staleId, staleSecret.answer, NOW + 1000);
  const settled = staleDb.raw("SELECT week_points FROM kide_compete_players WHERE player_id = ?", PID).week_points;
  staleDb.prepare("UPDATE kide_compete_questions SET used = 0 WHERE id = ?").bind(staleId).run();
  const replay = await answerQuestion(staleDb, PID, staleId, staleSecret.answer, NOW + 1500);
  eq("a stale copy of a settled question scores nothing", replay.body.points, 0);
  eq("the stored total does not grow", staleDb.raw("SELECT week_points FROM kide_compete_players WHERE player_id = ?", PID).week_points, settled);
}

{
  const db = memoryDb();
  const rng = mulberry32(30);
  const issued = await issueQuestion(db, PID, NOW, rng);
  const secret = db.raw("SELECT answer FROM kide_compete_questions WHERE id = ?", issued.body.question.id);
  await answerQuestion(db, PID, issued.body.question.id, secret.answer, NOW + 1000);
  await setHandle(db, PID, "Oak", true, NOW + 1000);
  const nextWeek = Date.UTC(2026, 10, 4, 12, 0, 0);
  const fresh = await issueQuestion(db, PID, nextWeek, rng);
  const secret2 = db.raw("SELECT answer FROM kide_compete_questions WHERE id = ?", fresh.body.question.id);
  const scored = await answerQuestion(db, PID, fresh.body.question.id, secret2.answer, nextWeek + 1000);
  ok("a new week does not keep last week's points", scored.body.weekPoints === scored.body.points, String(scored.body.weekPoints));
  const board = await getBoard(db, nextWeek + 1000);
  eq("this week's board is that new total", board.body.entries[0].points, scored.body.weekPoints);
  const old = await getBoard(db, NOW + 1000);
  eq("last week's board was not deleted", old.body.entries.length, 1);
  ok("the two weeks differ", weekKey(new Date(NOW)) !== weekKey(new Date(nextWeek)));
}

{
  const db = memoryDb();
  const env = signedEnv(db);
  const rng = mulberry32(31);
  const issued = await issueQuestion(db, PID, NOW, rng);
  const secret = db.raw("SELECT answer FROM kide_compete_questions WHERE id = ?", issued.body.question.id);
  const expectedId = await parentIdFrom(new Request("http://kide.test/api/compete/answer"), env);
  await handleCompete(new Request("http://kide.test/api/compete/answer", {
    method: "POST",
    body: JSON.stringify({
      playerId: PID,
      questionId: issued.body.question.id,
      choice: secret.answer,
      accountId: ACCOUNT,
    }),
  }), env, NOW + 1000, rng);
  const stored = db.raw("SELECT account_id FROM kide_compete_players WHERE player_id = ?", PID);
  eq("a signed-in score uses currentParent parentId", stored.account_id, expectedId);
  ok("the body account id is not stored on the score", stored.account_id !== ACCOUNT);
}

console.log("--- practice timing is not a score ---");

{
  const db = memoryDb();
  const anon = await handlePlayEvents(new Request("http://kide.test/api/play/events", {
    method: "POST",
    body: JSON.stringify({
      playerId: PID,
      accountId: "parent_acct_01",
      events: [{ item_id: "colors-1", skill: "colors", shown_at: NOW, answered_at: NOW + 900, correct: true }],
    }),
  }), db, NOW);
  const anonBody = await anon.json();
  eq("anonymous timing stays on the device", anonBody.stored, "device");
  eq("anonymous timing does not open a table", db.raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kide_play_events'"), null);

  const env = signedEnv(db);
  const expectedId = await parentIdFrom(new Request("http://kide.test/api/play/events"), env);
  ok("the session parent id is the one currentParent returns", typeof expectedId === "string" && expectedId.startsWith("p_"));
  const signed = await handlePlayEvents(new Request("http://kide.test/api/play/events", {
    method: "POST",
    body: JSON.stringify({
      playerId: PID,
      accountId: ACCOUNT,
      events: [
        { item_id: "colors-2", skill: "colors", shown_at: NOW, answered_at: NOW + 900, correct: true, mode: "practice" },
        { item_id: "potty-1", skill: "potty", shown_at: NOW, answered_at: NOW + 400, correct: true },
      ],
    }),
  }), env, NOW);
  const signedBody = await signed.json();
  eq("a signed-in sample is stored", signedBody.stored, "account");
  eq("one row, the routine was not a skill", signedBody.n, 1);
  const row = db.raw("SELECT * FROM kide_play_events");
  eq("latency comes from the two timestamps", row.latency_ms, 900);
  eq("the account id is currentParent parentId", row.account_id, expectedId);
  ok("a body account id is ignored", row.account_id !== ACCOUNT);
  const board = await getBoard(db, NOW);
  eq("a practice sample does not reach the board", board.body.entries.length, 0);
}

console.log("--- visitor copy ---");

{
  const play = readFileSync("./public/play/index.html", "utf8");
  ok("the page asks the compete route", play.includes("/api/compete/"));
  ok("the page asks the parent session before sending timing", play.includes("/api/account/session"));
  ok("the page does not invent an account id", !play.includes("kide_account_id") && !play.includes("__kideAccountId"));
  ok("the timer ring is on the challenge screen", play.includes('id="chalRing"'));
  const added = play.slice(play.indexOf("/* mode switch"), play.indexOf("/* question card"));
  ok("the switch copy has no ranking word", !/\b(fastest|best|only|most|leading|currently)\b|is available|now available/i.test(added));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
