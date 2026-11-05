#!/usr/bin/env node
// Money path: signup → paid step (lesson_studio_monthly) → Stripe.
// Local preflight for Lesson Studio. Writes gate JSON and exits 0 only when
// test-studio.mjs passes. Does not deploy and does not call Stripe.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const run = spawnSync(process.execPath, ["test-studio.mjs"], { encoding: "utf8" });
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");
const status = run.status ?? 1;
const passed = (run.stdout || "").match(/^\s*ok\s/gm)?.length || 0;
const failed = (run.stdout || "").match(/^\s*FAIL\s/gm)?.length || 0;
const gate = {
  ok: status === 0 && failed === 0,
  domain: "kide.us",
  module: "P5 AI Lesson Studio",
  offeringId: "lesson_studio_monthly",
  checkout: "coming_soon",
  at: new Date().toISOString(),
  summary: {
    passing: passed,
    failing: failed,
    checks: [
      "entitlement_enables_studio",
      "lesson_validates_and_plays",
      "unapproved_hidden_from_child",
      "unsafe_prompt_refused",
    ],
  },
  findings: status === 0 && failed === 0 ? [] : [{
    kind: "test-studio",
    defects: [`test-studio.mjs exited ${status} with ${failed} failure(s)`],
  }],
};
mkdirSync("gate-preflight-out", { recursive: true });
const out = join("gate-preflight-out", "gate.json");
writeFileSync(out, JSON.stringify(gate, null, 2));
console.log(`gate JSON: ${out} (exit ${gate.ok ? 0 : status}${gate.ok ? " = 0 findings" : " = findings"})`);
process.exit(gate.ok ? 0 : (status || 1));
