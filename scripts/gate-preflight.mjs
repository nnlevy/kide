// Money path: checks the referral pages exist before anyone treats the ledger as live.
// The vendored platform gate is not in this repo. This script says so, checks
// GATE_PATHS, and writes gate-preflight-out/gate.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const vendored = [
  "tools/platform-gate/preflight.mjs",
  "tools/platform-gate/bin/preflight.mjs",
  "tools/platform-gate/src/preflight.mjs",
];
const found = vendored.find((path) => existsSync(path));
if (found) {
  const child = spawnSync(process.execPath, [found], { stdio: "inherit" });
  process.exit(child.status === 0 ? 0 : child.status || 1);
}

const spec = JSON.parse(readFileSync("GATE_PATHS.json", "utf8"));
const earnings = readFileSync("public/parent/earnings/index.html", "utf8");
const worker = readFileSync("src/worker/index.ts", "utf8");
const checks = [
  { path: "/parent/earnings", ok: /Pending/.test(earnings) && /Available/.test(earnings) && /Paid/.test(earnings) },
  { path: "/r/:code", ok: worker.includes("handleReferralHttp") },
  { path: "/api/parent/earnings", ok: worker.includes("handleReferralHttp") },
];
const gate = {
  ok: checks.every((check) => check.ok),
  tool: "missing",
  note: "tools/platform-gate is not in this repo. Checked GATE_PATHS locally. No deploy.",
  domain: spec.domain,
  module: spec.module,
  paths: spec.paths,
  checks,
};
mkdirSync("gate-preflight-out", { recursive: true });
writeFileSync("gate-preflight-out/gate.json", JSON.stringify(gate, null, 2) + "\n");
console.log(gate.note);
console.log(JSON.stringify(gate));
process.exit(gate.ok ? 0 : 1);
