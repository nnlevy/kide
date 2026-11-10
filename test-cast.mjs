// Pip's Cast Club: the promises it makes to a parent, checked.
//
//   node test-cast.mjs
//
// 1. Pip never gives medical advice (every line, for every set-up).
// 2. The child's side of the app makes no network request at all.
// 3. The child's name never leaves the phone, including in the AI story call.
// 4. The public page is findable; the app is not; only the public page is measured.
// 5. Nothing is sold on a child's screen.

import { readFileSync } from "node:fs";
import assert from "node:assert";
import { deviceUnlockKey } from "./src/unlock/entitlement.js";

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const read = (p) => readFileSync(p, "utf8");

const C = await import("./public/cast/content.js");
const S = await import("./src/cast/story.js");
const { isMeasured } = await import("./public/engine/measure.js");

const SETUPS = [];
for (const kind of Object.keys(C.KINDS)) for (const where of Object.keys(C.WHERE)) for (const name of ["", "Mia"]) {
  SETUPS.push({ kind, where, color: "blue", name });
}

console.log("\nPip never gives medical advice");

await t("no chapter, script or tonight's story uses a medical-advice word", () => {
  for (const setup of SETUPS) {
    const w = C.words(setup);
    for (const ch of C.CHAPTERS) {
      for (const line of [C.chapterTitle(ch, w), ...ch.pages(w)]) {
        assert(!C.BANNED.test(line), `chapter ${ch.id} (${setup.kind}/${setup.where}): "${line}"`);
      }
    }
    for (const s of C.SCRIPTS) {
      for (const line of [s.title, s.say(w), s.tip]) assert(!C.BANNED.test(line), `script ${s.id}: "${line}"`);
    }
    const story = C.localStory(setup, C.TODAY.map((x) => x.id), "dinosaurs");
    for (const line of story.pages) assert(!C.BANNED.test(line), `local story: "${line}"`);
  }
});

await t("the itchy script sends the grown-up to the doctor", () => {
  const s = C.SCRIPTS.find((x) => x.id === "itchy");
  assert(s.free, "the itchy script must be free: it is the safety one");
  assert(/doctor/.test(s.tip) && /doctor/.test(s.say(C.words({}))));
});

await t("the doctor note is on the public page, the set-up and the grown-up corner", () => {
  assert(/ask your child's doctor/i.test(read("public/cast/index.html")), "public page");
  assert(/ask your child's doctor/i.test(read("public/cast/app/index.html")), "set-up");
  assert(/DOCTOR_NOTE/.test(read("public/cast/app/grownup.js")), "grown-up corner");
  assert(/ask your child's doctor/i.test(C.DOCTOR_NOTE));
});

await t("BANNED catches the things a bedtime story must not say", () => {
  for (const bad of ["Give her some ibuprofen", "two weeks to heal", "do your stretches", "put weight on it", "take your medicine", "5 mg"]) {
    assert(C.BANNED.test(bad), `not caught: ${bad}`);
  }
  for (const ok of ["Pip took big flower breaths.", "Goodnight, cast.", "The doctor will tell us what comes next."]) {
    assert(!C.BANNED.test(ok), `false alarm: ${ok}`);
  }
});

console.log("\nthe child's side makes no network request");

const KID_FILES = ["public/cast/app/app.js", "public/cast/app/games.js", "public/cast/app/state.js",
  "public/cast/pip-cast.js", "public/cast/content.js", "public/unlock/gate.js", "public/cast/return.js"];

await t("no fetch, beacon, XHR, socket or measurement on the child's side", () => {
  for (const f of KID_FILES) {
    const src = read(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(!/\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource|measure\.js/.test(src), `${f} talks to a server`);
  }
});

await t("the grown-up corner (the only networked module) loads only after the grown-up check", () => {
  const app = read("public/cast/app/app.js");
  assert(!/^import .*grownup\.js/m.test(app), "grownup.js is imported statically");
  assert(/gate\(grownup\)/.test(app), "the grown-up corner is not behind gate()");
  assert(/import\("\.\/grownup\.js"\)/.test(app), "grownup.js is not a dynamic import");
});

await t("the app page loads no third-party script and no beacon", () => {
  const h = read("public/cast/app/index.html");
  assert(!/<script[^>]+src="https?:/.test(h), "external script on the app");
  assert(!/measure\.js|googletagmanager|gtag\(|adsbygoogle/.test(h), "measurement on the app");
});

console.log("\nthe child's name never leaves the phone");

await t("the story request body carries ids only, never the name", () => {
  const g = read("public/cast/app/grownup.js");
  const body = (g.match(/body: JSON\.stringify\(\{([^}]*)\}\)/) || [])[1];
  assert(body, "could not find the story request body");
  assert(!/name/.test(body), `story request sends: ${body}`);
});

await t("the server drops anything outside the closed lists, including a name", () => {
  const req = S.cleanRequest({ kind: "cast", where: "arm", color: "pink", name: "Mia", today: ["brave", "evil", "doctor", "xray", "sad"], like: "<script>" });
  assert.deepEqual(Object.keys(req).sort(), ["color", "crutches", "kind", "like", "today", "where"]);
  assert.deepEqual(req.today, ["brave", "doctor", "xray"]);
  assert.equal(req.like, "");
  const { system, user } = S.prompt(req);
  assert(!/Mia/.test(system + user), "the name reached the prompt");
  assert(/CHILD/.test(system), "the model is not told to use CHILD for the name");
});

await t("cleanName keeps a first name or nickname and nothing else", () => {
  assert.equal(C.cleanName("  Zoë-Ann <b>  "), "Zoë-Ann b");
  assert.equal(C.cleanName("a".repeat(40)).length, 20);
  assert.equal(C.cleanName("555-1234 @x"), "x");
});

console.log("\ntonight's story is checked before a child hears it");

const story = (pages, title = "Pip and CHILD") => JSON.stringify({ title, pages });
await t("checkStory takes a gentle story and rejects medical or linked content", () => {
  assert(S.checkStory(story(["Pip yawned.", "CHILD yawned too.", "They counted moons.", "Goodnight."])));
  assert.equal(S.checkStory(story(["Pip took medicine.", "b", "c"])), null);
  assert.equal(S.checkStory(story(["In two weeks you heal.", "b", "c"])), null);
  assert.equal(S.checkStory(story(["See www.x.com", "b", "c"])), null);
  assert.equal(S.checkStory(story(["too", "short"])), null);
  assert.equal(S.checkStory("not json"), null);
});

function env({ reply, used = 0 } = {}) {
  const store = new Map();
  if (used) store.set(`cast:story:${new Date().toISOString().slice(0, 10)}:${"d".repeat(24)}`, String(used));
  return {
    store,
    KIDE_LEADS: { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } },
    PORTFOLIO_AI_SERVICE: {
      calls: [],
      async createChatCompletion(input) {
        this.calls.push(input);
        return { ok: true, data: { choices: [{ message: { content: reply } }] } };
      },
    },
  };
}
const post = (body, cookie = `kide_device=${"d".repeat(24)}`) =>
  new Request("https://kide.us/api/cast/story", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const good = story(["Pip yawned a big yawn.", "CHILD yawned too.", "They counted the moons.", "Goodnight, Pip. Goodnight, CHILD."]);

await t("a free device gets one AI story a day, then the phone writes it", async () => {
  const e = env({ reply: good });
  const r1 = await S.handleCastStory(post({ kind: "cast", today: ["brave"], name: "Mia" }), e);
  const d1 = await r1.json();
  assert.equal(d1.ok, true, JSON.stringify(d1));
  assert(!JSON.stringify(e.PORTFOLIO_AI_SERVICE.calls).includes("Mia"), "the name reached the AI");
  const r2 = await S.handleCastStory(post({ kind: "cast" }), e);
  const d2 = await r2.json();
  assert.equal(d2.reason, "limit");
  assert.equal(S.FREE_PER_DAY, 1);
});

await t("an unusable AI reply is refused and not counted", async () => {
  const e = env({ reply: story(["Take your medicine.", "b", "c", "d"]) });
  const r = await S.handleCastStory(post({}), e);
  assert.equal(r.status, 502);
  assert.equal(e.store.size, 0, "a refused story used up the allowance");
});

await t("no device cookie, no AI story", async () => {
  const r = await S.handleCastStory(post({}, ""), env({ reply: good }));
  assert.equal((await r.json()).reason, "nodevice");
});

await t("GET is refused", async () => {
  const r = await S.handleCastStory(new Request("https://kide.us/api/cast/story"), env({ reply: good }));
  assert.equal(r.status, 405);
});

console.log("\nfindable where it should be, private where it should be");

await t("/cast is in the sitemap and measured; /cast/app is neither", () => {
  const xml = read("public/sitemap.xml");
  assert(xml.includes("<loc>https://kide.us/cast</loc>"), "/cast missing from the sitemap");
  assert(!xml.includes("https://kide.us/cast/app"), "/cast/app is in the sitemap");
  assert(/Disallow: \/cast\/app\//.test(read("public/robots.txt")), "robots does not disallow /cast/app/");
  assert(isMeasured("/cast") && isMeasured("/cast/"));
  assert(!isMeasured("/cast/app") && !isMeasured("/cast/app/"), "/cast/app is measured");
  assert(/noindex/.test(read("public/cast/app/index.html")), "/cast/app is indexable");
  assert(/measure\.js/.test(read("public/cast/index.html")), "/cast never loads measure.js");
});

await t("the homepage links the Cast Club", () => {
  assert(/href="\/cast"/.test(read("index.html")));
});

await t("the worker routes /api/cast/story", () => {
  assert(/\/api\/cast\/story/.test(read("src/worker/index.ts")));
});

console.log("\nnothing is sold on a child's screen");

await t("no price or checkout link on the child's screens", () => {
  const h = read("public/cast/app/index.html");
  const kid = h.split(/<section id="gate"/)[0].split(/<section id="handoff"/)[1] || "";
  assert(kid.length > 500, "could not isolate the child's screens");
  assert(!/\$\d|\/unlock|checkout|family play/i.test(kid), "a sales line is on a child's screen");
  const app = read("public/cast/app/app.js");
  assert(!/\$\d|\/unlock\/(?!gate\.js)|checkout/i.test(app), "app.js sells");
});

await t("the price on the public page matches the family unlock config", async () => {
  const { AMOUNT_LABEL } = await import("./src/unlock/config.js");
  assert(read("public/cast/index.html").includes(`${AMOUNT_LABEL} once`));
  assert(read("public/cast/app/grownup.js").includes(`${AMOUNT_LABEL} for your family`));
  assert(!read("public/cast/app/grownup.js").includes("opens all of Kide"), "$15 is family play, not the clinician licence");
  assert(read("public/cast/app/grownup.js").includes("It opens family play"));
});

console.log("\nthe promises match what leaves the phone");

await t("visitor copy names the story send, the card, and what delete clears", () => {
  const files = ["public/cast/index.html", "public/cast/app/grownup.js", "public/cast/app/index.html", "public/privacy/index.html"];
  const pages = files.map(read).join("\n");
  for (const gone of [
    "only the taps",
    "Only what you type",
    "from those taps alone",
    "beyond a nickname and the dates",
    "Nothing you type leaves",
    "nothing you type leaves",
    "deletes it all",
    "opens all of Kide",
    "Delete everything on this phone",
    "What you type stays on this phone",
  ]) {
    assert(!pages.includes(gone), `still says: ${gone}`);
  }
  const welcome = read("public/cast/index.html");
  const grown = read("public/cast/app/grownup.js");
  const setup = read("public/cast/app/index.html");
  const privacy = read("public/privacy/index.html");
  for (const src of [welcome, grown, privacy]) {
    assert(src.includes("device cookie"), "missing the device cookie");
    assert(src.includes("The device cookie lasts one year"), "missing the device cookie lifetime");
    assert(src.includes("stored for 36 hours"), "missing the story count");
    assert(src.includes("A new UTC day starts the allowance again"), "story count must restart on the UTC day");
    assert(!src.includes("a day and a half"), "story count still says a day and a half");
  }
  assert(setup.includes("send those choices later"), "set-up does not say the choices are sent later");
  assert(setup.includes("together with this phone's device cookie"));
  assert(setup.includes("The device cookie lasts one year"));
  assert(setup.includes("does not send the name or the visit date"));
  assert(setup.includes("that picture can include the name"));
  assert(!setup.includes("It stays on this phone"));
  assert(welcome.includes("cast set-up saved at the start"));
  assert(welcome.includes("picture can include the name"));
  assert(grown.includes("picture can include the name"));
  assert(grown.includes("This phone also sends its device cookie"));
  assert(grown.includes("The name is not in that request"));
  assert(!grown.includes("The name never leaves this phone"));
  assert(welcome.includes("does not clear the device cookie"));
  assert(grown.includes("Delete Cast Club on this phone clears what was saved here"));
  assert(grown.includes("does not clear the device cookie or that story count"));
  assert(privacy.includes("Cast Club welcome page"));
  assert(privacy.includes("do not use a parent sign-in for that story"));
  assert(pages.includes("whether family play is already on"));
  const json = welcome.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert(json.includes("device cookie") && !json.includes("only the taps") && !json.includes("Only what you type"));
  assert(json.includes("The device cookie lasts one year") && json.includes("stored for 36 hours") && json.includes("A new UTC day starts the allowance again"));
  const visibleFaq = welcome.match(/What do you store about my child\?<\/summary><p>([^<]+)<\/p>/)[1];
  const jsonFaq = JSON.parse(json)["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity.find((q) => q.name === "What do you store about my child?").acceptedAnswer.text;
  assert.equal(visibleFaq, jsonFaq, "the visible FAQ and the JSON-LD answer drifted");
  assert(!/gpt-4o|kide\.cast\.v1/.test(pages), "visitor copy uses an internal name");
});

await t("a parent sign-in on the story request is not used", async () => {
  const sessions = [];
  const e = env({ reply: good });
  e.PORTFOLIO_MESSAGING_SERVICE = {
    async currentSession({ session }) {
      sessions.push(session);
      if (String(session).includes("__Host-rft_session=parent")) return { ok: true, email: "parent@example.com" };
      return { ok: false };
    },
  };
  e.PORTFOLIO_BILLING_SERVICE = {
    async getCredits() {
      return { ok: true, purchases: [{ domain: "kide.us", offeringId: "family_unlock", status: "paid" }] };
    },
  };
  const id = "d".repeat(24);
  const cookie = `kide_device=${id}; __Host-rft_session=parent`;
  const first = await S.handleCastStory(post({ kind: "cast", where: "leg", crutches: true }, cookie), e);
  assert.equal((await first.json()).ok, true);
  const second = await S.handleCastStory(post({ kind: "cast" }, cookie), e);
  assert.equal((await second.json()).reason, "limit", "a forwarded parent sign-in would have raised the allowance");
  assert.equal(sessions.length, 0, "the story path asked who was signed in");
  const sent = JSON.stringify(e.PORTFOLIO_AI_SERVICE.calls);
  assert(!sent.includes(id), "the device number reached the story writer");
});

await t("family play already on this phone still allows more stories", async () => {
  const id = "e".repeat(24);
  const e = env({ reply: good });
  e.store.set(deviceUnlockKey(id), JSON.stringify({ unlocked: true, email: "parent@example.com", at: Date.now() }));
  for (let i = 0; i < S.FAMILY_PER_DAY; i++) {
    const r = await S.handleCastStory(post({ kind: "cast" }, `kide_device=${id}`), e);
    assert.equal((await r.json()).ok, true, `story ${i + 1}`);
  }
  const over = await S.handleCastStory(post({ kind: "cast" }, `kide_device=${id}`), e);
  assert.equal((await over.json()).reason, "limit");
});

console.log("\ncounting sleeps");

await t("sleepsUntil counts local days", () => {
  const now = new Date(2026, 10, 9, 23, 30);
  assert.equal(C.sleepsUntil("2026-11-10", now), 1);
  assert.equal(C.sleepsUntil("2026-11-09", now), 0);
  assert.equal(C.sleepsUntil("2026-11-16", now), 7);
  assert.equal(C.sleepsUntil("2026-11-01", now), -8);
  assert.equal(C.sleepsUntil("nope", now), null);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
