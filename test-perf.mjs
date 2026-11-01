// Time-to-correct: a fast hand triggers, a slow one does not.
// Median per skill, not a single quick tap.

import { readFileSync } from "node:fs";
import {
  FAST_MIN_ITEMS, SAMPLE_WINDOW, AGE_BANDS,
  noteEvent, isConsistentlyFast, median, latencyOf, validAccountId, emptyState,
} from "./src/perf/track.js";

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " -- " + detail : ""}`); }
};
const eq = (name, actual, expected) => {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

function fill(skill, ms, n, correct = true) {
  let state = emptyState();
  const shown = 1_000_000;
  for (let i = 0; i < n; i++) {
    state = noteEvent(state, {
      item_id: skill + "-" + i,
      skill,
      shown_at: shown,
      answered_at: shown + ms,
      correct,
    });
  }
  return state;
}

console.log("\n--- median, per skill ---");

{
  const nine = fill("colors", 800, FAST_MIN_ITEMS - 1);
  eq("nine quick answers are not enough", isConsistentlyFast(nine, "preschool").fast, false);
  const ten = noteEvent(nine, {
    item_id: "colors-9", skill: "colors", shown_at: 5_000, answered_at: 5_800, correct: true,
  });
  const read = isConsistentlyFast(ten, "preschool");
  eq("ten under the line is quick", read.fast, true);
  eq("the skill that qualified is named", read.skill, "colors");
  eq("the median of identical samples is that sample", read.median, 800);

  const slow = fill("counting", AGE_BANDS.preschool.maxMedianMs + 1, 10);
  eq("ten just over the line is not quick", isConsistentlyFast(slow, "preschool").fast, false);
  const onLine = fill("shapes", AGE_BANDS.preschool.maxMedianMs, 10);
  eq("exactly on the line is quick", isConsistentlyFast(onLine, "preschool").fast, true);
}

{
  // Nine quick answers and one slow one: the mean sits over the line, the median does not.
  let state = emptyState();
  const shown = 10_000;
  for (let i = 0; i < 9; i++) {
    state = noteEvent(state, {
      item_id: "letters-" + i, skill: "letters", shown_at: shown, answered_at: shown + 2000, correct: true,
    });
  }
  state = noteEvent(state, {
    item_id: "letters-slow", skill: "letters", shown_at: shown, answered_at: shown + 9000, correct: true,
  });
  const med = median(state.bySkill.letters);
  eq("median ignores the one slow answer", med, 2000);
  eq("that hand is quick for preschool", isConsistentlyFast(state, "preschool").fast, true);
  eq("the same hand is not quick for the early band", isConsistentlyFast(state, "early").fast, false);
  const mean = state.bySkill.letters.reduce((s, n) => s + n, 0) / state.bySkill.letters.length;
  ok("the mean would have said something else", mean > AGE_BANDS.preschool.maxMedianMs, String(mean));
}

{
  let state = fill("feelings", 1000, 10);
  state = noteEvent(state, {
    item_id: "nope", skill: "feelings", shown_at: 100, answered_at: 150, correct: true,
  });
  state = noteEvent(state, {
    item_id: "left-open", skill: "feelings", shown_at: 100, answered_at: 100 + 200000, correct: true,
  });
  eq("a tap quicker than noticing is not stored", state.bySkill.feelings.length, 10);
  eq("a miss is not a time-to-correct", latencyOf({
    skill: "colors", shown_at: 0, answered_at: 1000, correct: false,
  }), null);
  for (let i = 0; i < SAMPLE_WINDOW + 5; i++) {
    state = noteEvent(state, {
      item_id: "w-" + i, skill: "colors", shown_at: 0, answered_at: 1000 + i, correct: true,
    });
  }
  eq("the window stays capped", state.bySkill.colors.length, SAMPLE_WINDOW);
}

{
  const fastColors = fill("colors", 700, 10);
  const mixed = noteEvent(fastColors, {
    item_id: "counting-slow", skill: "counting", shown_at: 0, answered_at: 8000, correct: true,
  });
  eq("one quick skill is enough", isConsistentlyFast(mixed, "toddler").fast, true);
  eq("an unknown band uses the preschool line", isConsistentlyFast(fill("colors", 3000, 10), "nope").fast, false);
}

console.log("--- account id hook ---");

{
  eq("an account id has a shape", validAccountId("acct_parent_12"), true);
  eq("an email is not an account id", validAccountId("parent@kide.us"), false);
  eq("a short token is not an account id", validAccountId("abc"), false);
  eq("empty is not an account id", validAccountId(""), false);
}

console.log("--- the page a child sees ---");

{
  const play = readFileSync("./public/play/index.html", "utf8");
  const served = readFileSync("./public/perf/track.js", "utf8");
  const src = readFileSync("./src/perf/track.js", "utf8");
  eq("the browser copy matches the module", served, src);
  ok("Pip says the pace line", play.includes("Either a kid is playing at a grown-up level"));
  ok("the mode switch draws a ring", play.includes("modeRingDraw"));
  ok("reduced motion skips the switch animation", /prefers-reduced-motion:\s*reduce[\s\S]*\.mode-shift/.test(play));
  ok("the switch itself checks reduced motion", play.includes('"(prefers-reduced-motion: reduce)"'));
  const routineStart = play.indexOf("function routineTap()");
  const routineEnd = play.indexOf("function startRoutine(");
  const routineBody = play.slice(routineStart, routineEnd);
  ok("Pip's Turn still does not record a pace", !routineBody.includes("recordTiming") && !routineBody.includes("noteSpeed"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
