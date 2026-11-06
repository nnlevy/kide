#!/usr/bin/env node
/**
 * Daily live mobile check (MOBILE-SPEC.md) over EVERY live portfolio site.
 * Site list comes from live-sites.mjs: the Cloudflare registry (live-truth state/live/cf/domains.json) unioned with
 * the routes in each repo's wrangler config. Never a hand-kept list. A missing/not-ok registry is itself a failure.
 * Every site is a FAIL unless mobile-strict.mjs ran to completion and returned all profiles passing:
 * unreachable sites, crashes, timeouts, missing/short reports and unreadable configs all count as failures.
 * Usage: node tools/platform-gate/daily-mobile.mjs [--workspace DIR] [--registry domains.json] [--out DIR] [--only a.com,b.com] [--list]
 * Exit 0 only if every site passes; 1 otherwise; 2 if the site list itself cannot be built or is empty.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main.mjs";
import { allLiveSites } from "./live-sites.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXPECTED_PROFILES = 15;

// Pure verdict for one site run, so it is unit-testable without a browser.
export function siteVerdict({ status, signal, error, rows, expected = EXPECTED_PROFILES }) {
  if (error) return { ok: false, reason: `run error: ${error}` };
  if (signal) return { ok: false, reason: `run killed: ${signal}` };
  if (!Array.isArray(rows)) return { ok: false, reason: `no report (exit ${status})` };
  if (rows.length < expected) return { ok: false, reason: `only ${rows.length}/${expected} profiles ran (exit ${status})` };
  const bad = rows.filter((r) => (r.defects || []).length);
  const pass = rows.length - bad.length;
  if (bad.length) return { ok: false, pass, total: rows.length, reason: `${pass}/${rows.length}: ${bad.slice(0, 3).map((r) => `[${r.device}: ${r.defects[0]}]`).join(" ")}` };
  if (status !== 0) return { ok: false, pass, total: rows.length, reason: `exit ${status} with all rows passing` };
  return { ok: true, pass, total: rows.length, reason: `${pass}/${rows.length}` };
}

export function loadRegistry(path) {
  try {
    if (path) return JSON.parse(readFileSync(path, "utf8"));
    const repo = join(HERE, "../..");
    spawnSync("git", ["-C", repo, "fetch", "-q", "origin", "live-truth"], { timeout: 60000 });
    const r = spawnSync("git", ["-C", repo, "show", "origin/live-truth:state/live/cf/domains.json"], { encoding: "utf8", maxBuffer: 64 << 20 });
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch { return null; }
}

function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const ws = opt("workspace", process.env.PORTFOLIO_WORKSPACE || join(process.env.HOME || "", ".openclaw/workspace"));
  const out = opt("out", `daily-mobile-${new Date().toISOString().slice(0, 10)}`);
  let list;
  try { list = allLiveSites({ workspace: ws, registry: loadRegistry(opt("registry")) }); } catch (e) { console.error(`FAIL site list: ${e.message}`); return 2; }
  let { sites, errors } = list;
  if (opt("only")) { const only = new Set(opt("only").split(",")); sites = sites.filter((s) => only.has(s.site)); }
  if (argv.includes("--list")) { for (const s of sites) console.log(`${s.site}\t${s.url}\t${s.repo}`); for (const e of errors) console.log(`ERROR\t${e.repo}\t${e.error}`); return errors.length ? 1 : 0; }
  if (!sites.length) { console.error(`FAIL site list empty for ${ws}`); return 2; }
  mkdirSync(out, { recursive: true });
  const results = errors.map((e) => ({ site: e.repo, url: null, ok: false, reason: e.error }));
  for (const s of sites) {
    const dir = join(out, s.site);
    const r = spawnSync(process.execPath, [join(HERE, "mobile-strict.mjs"), s.url, "--out", dir, "--strict"], { encoding: "utf8", timeout: 45 * 60 * 1000, maxBuffer: 64 << 20 });
    let rows; const rep = join(dir, "report.json");
    if (existsSync(rep)) { try { rows = JSON.parse(readFileSync(rep, "utf8")); } catch { rows = undefined; } }
    const v = siteVerdict({ status: r.status, signal: r.signal, error: r.error?.message, rows });
    if (!v.ok && !Array.isArray(rows)) v.reason += ` :: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ").slice(0, 200)}`;
    results.push({ site: s.site, url: s.url, repo: s.repo, ...v });
    console.log(`${v.ok ? "PASS" : "FAIL"} ${s.site.padEnd(32)} ${v.reason}`);
  }
  writeFileSync(join(out, "summary.json"), JSON.stringify({ at: new Date().toISOString(), workspace: ws, results }, null, 1));
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} sites pass`);
  return failed.length ? 1 : 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
