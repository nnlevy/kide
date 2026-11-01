#!/usr/bin/env node
// Subpage ratchet (2026-10-22, CoS decision). The committed baseline (baseline/subpages.json) lists each
// site's known subpage failures, per page and per check, each site with a remove_by date. It may only shrink.
// A deploy is blocked when: a page has a new failure or a check got worse; a passing page regresses; the deploy
// changes a baselined page (git diff vs .wrangler/last-deploy.json sha) without fixing that page; any js_error;
// or any failure on the home page / keyurls pages (always strict, never baselined). Expired entries stop counting.
// Fixed entries shrink automatically: the shrunk entry is written to an overlay file (state/platform-gate-ratchet)
// and logged; effective baseline = committed ∩ overlay, so a fix can never be un-fixed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main.mjs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_FILE = join(HERE, "baseline", "subpages.json");

export const normPath = (p) => { let s = String(p || "/").split(/[?#]/)[0]; if (!s.startsWith("/")) s = "/" + s; s = s.replace(/\/+$/, ""); return s || "/"; };
const pathOf = (u) => { try { return normPath(new URL(u).pathname); } catch { return normPath(u); } };

/** "6 text<12px: b ..." -> {check:"mobile:text<12px", n:6} */
export function checkOf(defect) {
  const d = String(defect).trim(); let m;
  if ((m = d.match(/^(\d+) (taps<\d+|text<\d+px)/))) return { check: `mobile:${m[2]}`, n: +m[1] };
  if ((m = d.match(/^axe critical: (.*)$/))) return { check: "mobile:axe-critical", n: m[1].split(/,\s*/).filter(Boolean).length || 1 };
  if (/^overflow \d+px/.test(d)) return { check: "mobile:overflow", n: 1 };
  if (/^CLS /.test(d)) return { check: "mobile:cls", n: 1 };
  if ((m = d.match(/^([a-z][a-z -]*?)(?::|\s\d|$)/i))) return { check: `mobile:${m[1].trim().toLowerCase().replace(/\s+/g, "-")}`, n: 1 };
  return { check: "mobile:other", n: 1 };
}

const claimKey = (c) => `${String(c.match || "").replace(/\s+/g, " ").trim()}|${String(c.text || "").replace(/\s+/g, " ").trim().slice(0, 160)}`;

/** gate.json -> { "/path": { check: n } } ; js_error and site-level findings are returned separately (never baselined) */
export function pageFailures(gate, { legacyUncited = new Set() } = {}) {
  const pages = {}; const bump = (p, check, n) => { const e = (pages[p] ||= {}); e[check] = Math.max(e[check] || 0, n); };
  for (const u of gate.urls || []) pages[pathOf(u)] ||= {};
  for (const f of gate.mobile?.failing || []) for (const d of f.defects || []) { const { check, n } = checkOf(d); bump(pathOf(f.url), check, n); }
  const unc = {}; for (const c of gate.claims || []) if ((c.defects || []).includes("uncited") && c.page && !legacyUncited.has(claimKey(c))) unc[pathOf(c.page)] = (unc[pathOf(c.page)] || 0) + 1;
  for (const [p, n] of Object.entries(unc)) bump(p, "claims:new-uncited", n);
  for (const p of Object.keys(pages)) if (!Object.keys(pages[p]).length) delete pages[p];
  const jsErrors = (gate.claims || []).filter((c) => c.kind === "js_error").map((c) => ({ page: pathOf(c.page), error: c.match }));
  const siteLevel = (gate.claims || []).filter((c) => c.kind === "orphan_tools" || c.kind === "asset_html_fallback");
  return { pages, jsErrors, siteLevel, mobileError: gate.mobile?.error || null };
}

const total = (pages) => Object.values(pages || {}).reduce((a, e) => a + Object.values(e).reduce((x, y) => x + y, 0), 0);
export const siteTotal = (entry) => total(entry?.pages);
export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/** Build a fresh baseline from scan rows [{site, pages:{...}}]; strict paths are never baselined. Worst site gets the earliest date. */
export function buildBaseline(rows, { start = "2026-10-29", weeks = 8, strictPaths = {}, profiles = "15" } = {}) {
  const sites = {};
  for (const r of rows) {
    const strict = new Set(["/", ...(strictPaths[r.site] || [])].map(normPath));
    const pages = Object.fromEntries(Object.entries(r.pages || {}).filter(([p]) => !strict.has(normPath(p))).sort(([a], [b]) => a.localeCompare(b))
      .map(([p, e]) => [p, Object.fromEntries(Object.entries(e).sort(([a], [b]) => a.localeCompare(b)))]));
    sites[r.site] = { pages }; // sites with no failures stay listed (empty) so they get a profiles marker and a date
  }
  const order = Object.keys(sites).sort((a, b) => siteTotal(sites[b]) - siteTotal(sites[a]) || a.localeCompare(b));
  const span = weeks * 7 - 1; const t0 = Date.parse(start + "T12:00:00Z");
  const out = {};
  const ranked = order.filter((s) => siteTotal(sites[s]) > 0);
  ranked.forEach((s, i) => { out[s] = { remove_by: isoDay(t0 + Math.floor((i * span) / Math.max(1, ranked.length - 1)) * 864e5), profiles, total: siteTotal(sites[s]), pages: sites[s].pages }; });
  for (const s of order) if (!out[s]) out[s] = { remove_by: isoDay(t0 + span * 864e5), profiles, total: 0, pages: {} }; // nothing to fix yet: latest date (first-deploy 15-profile record keeps it)
  return { version: 1, rule: "shrink-only: no site/page/check may be added, no count raised, no remove_by moved later", sites: out };
}

/** Shrink-only check: returns a list of violations (empty = ok). */
export function shrinkViolations(oldB, newB) {
  const v = []; const o = oldB?.sites || {}; const n = newB?.sites || {};
  for (const [s, ne] of Object.entries(n)) {
    const oe = o[s]; if (!oe) { v.push(`added site ${s}`); continue; }
    if ((ne.profiles || "15") !== (oe.profiles || "15") && ne.profiles !== "15") v.push(`${s}: profiles ${oe.profiles} -> ${ne.profiles}`);
    if (ne.remove_by > oe.remove_by) v.push(`${s}: remove_by moved later ${oe.remove_by} -> ${ne.remove_by}`);
    for (const [p, chk] of Object.entries(ne.pages || {})) {
      const op = oe.pages?.[p]; if (!op) { v.push(`${s}: added page ${p}`); continue; }
      for (const [c, k] of Object.entries(chk)) { if (!(c in op)) v.push(`${s}${p}: added check ${c}`); else if (!(k <= op[c])) v.push(`${s}${p}: widened ${c} ${op[c]} -> ${k}`); }
    }
    if ((ne.total ?? siteTotal(ne)) !== siteTotal(ne)) v.push(`${s}: total ${ne.total} != sum ${siteTotal(ne)}`);
  }
  return v;
}

/** A site needs a first-deploy live comparison until it has a 15-profile record. */
export const needsLive = (entry) => !entry || entry.profiles !== "15";
/** 15-profile record from the live site's gate run (strict pages excluded). */
export function liveEntry(liveGate, committed, { strictPaths = [], legacyUncited } = {}) {
  const strict = new Set(["/", ...strictPaths].map(normPath));
  const pages = Object.fromEntries(Object.entries(pageFailures(liveGate, { legacyUncited }).pages).filter(([p]) => !strict.has(p)));
  return { remove_by: committed?.remove_by || isoDay(Date.now() + 28 * 864e5), profiles: "15", source: "live 15-profile run at first ratchet deploy", total: total(pages), pages };
}
/** Effective entry = committed ∩ overlay (min per check); a 15-profile overlay replaces a seeded (android-320) entry. */
export function intersect(a, b) {
  if (!a) return b && b.profiles === "15" ? b : null; if (!b) return a;
  if (b.profiles === "15" && a.profiles !== "15") return { ...b, remove_by: a.remove_by < b.remove_by ? a.remove_by : b.remove_by };
  const pages = {};
  for (const [p, chk] of Object.entries(a.pages || {})) { const bp = b.pages?.[p]; if (!bp) continue;
    const e = {}; for (const [c, k] of Object.entries(chk)) if (c in bp) e[c] = Math.min(k, bp[c]); if (Object.keys(e).length) pages[p] = e; }
  return { ...a, profiles: a.profiles === "15" || b.profiles === "15" ? "15" : a.profiles, pages, total: total(pages) };
}

/** Pages a deploy touches: changed files whose path maps to the route, or changed lines that mention the route literally. */
export function changedPages(diff, pages) {
  const files = []; const lines = []; let cur = null;
  for (const l of String(diff).split("\n")) {
    let m; if ((m = l.match(/^diff --git a\/(.+?) b\/(.+)$/))) { cur = m[2]; files.push(m[1], m[2]); continue; }
    if (/^(\+\+\+|---) /.test(l)) continue; if (/^[+-]/.test(l)) lines.push(l.slice(1));
  }
  const routeOf = (f) => normPath(f.replace(/^(?:.*\/)?(?:public|src|pages|static|site|dist|app|routes|content|www)\//, "").replace(/\.(html?|mdx?|astro|[jt]sx?|vue|svelte|njk|liquid)$/, "").replace(/(^|\/)index$/, ""));
  const fileRoutes = new Set(files.map(routeOf));
  return pages.filter((p) => { const n = normPath(p); if (n === "/") return false;
    if (fileRoutes.has(n)) return true;
    const re = new RegExp(`["'\`(=]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?["'\`)?#\\s]`);
    return lines.some((l) => re.test(l)); });
}

/** Core decision. */
export function evaluate({ gate, entry, strictPaths = [], changed = [], today = isoDay(Date.now()), legacyUncited, liveGate }) {
  const fromLive = !!liveGate; if (fromLive) entry = liveEntry(liveGate, entry, { strictPaths, legacyUncited });
  const { pages, jsErrors, siteLevel, mobileError } = pageFailures(gate, { legacyUncited });
  const strict = new Set(["/", ...strictPaths].map(normPath));
  const expired = entry && entry.remove_by && today > entry.remove_by;
  const base = expired ? {} : entry?.pages || {};
  const block = []; const fixed = []; const info = [];
  if (expired) info.push(`baseline for this site expired ${entry.remove_by}: all failures count`);
  for (const [p, chk] of Object.entries(pages)) {
    const b = strict.has(p) ? {} : base[p] || {};
    for (const [c, n] of Object.entries(chk)) {
      if (!(c in b)) block.push(`${strict.has(p) ? "STRICT" : Object.keys(b).length ? "NEW_FAILURE" : "REGRESSION"} ${p} ${c}=${n}`);
      else if (n > b[c]) block.push(`WORSE ${p} ${c} ${b[c]}->${n}`);
    }
  }
  const checked = new Set(Object.keys(pages).concat((gate.urls || []).map(pathOf)));
  const shrunk = {};
  for (const [p, chk] of Object.entries(base)) {
    if (!checked.has(p)) { shrunk[p] = chk; continue; } // not checked this run: keep as is
    const now = pages[p] || {}; const e = {};
    for (const [c, k] of Object.entries(chk)) { const n = now[c] || 0; if (n > 0) e[c] = Math.min(k, n); if (n < k) fixed.push(`${p} ${c} ${k}->${n}`); }
    if (Object.keys(e).length) shrunk[p] = e;
    if (changed.map(normPath).includes(p) && Object.keys(now).some((c) => c in chk)) block.push(`CHANGED_NOT_FIXED ${p} (edited since last deploy, still fails ${Object.keys(now).filter((c) => c in chk).join(",")})`);
  }
  for (const j of jsErrors) block.push(`JS_ERROR ${j.page}: ${String(j.error).slice(0, 80)}`);
  for (const s of siteLevel) block.push(`${s.kind.toUpperCase()} ${s.route || ""}`);
  if (mobileError) block.push(`MOBILE_ERROR ${mobileError}`);
  const newEntry = entry && !expired ? { ...entry, pages: shrunk, total: total(shrunk) } : entry || null;
  if (fromLive) info.push(`first 15-profile deploy: compared build with live (${entry.total} live failures on subpages)`);
  return { block, fixed, info, shrunk: fixed.length || fromLive ? newEntry : null };
}

function git(repo, args) { return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }); }
export function deployDiff(repo) {
  const f = join(repo, ".wrangler", "last-deploy.json");
  if (!existsSync(f)) return { diff: "", warn: `no ${f}: cannot tell which pages changed` };
  let sha; try { sha = JSON.parse(readFileSync(f, "utf8")).sha; } catch { return { diff: "", warn: `unreadable ${f}` }; }
  try { git(repo, ["cat-file", "-e", `${sha}^{commit}`]); } catch { return { diff: "", warn: `last deployed sha ${sha} not in ${repo}` }; }
  return { diff: git(repo, ["diff", "-U0", sha, "--"]), sha };
}

export function loadEffective(domain, { baselineFile = BASELINE_FILE, overlayDir } = {}) {
  let committed = null; try { committed = JSON.parse(readFileSync(baselineFile, "utf8")).sites?.[domain] || null; } catch {}
  let overlay = null; if (overlayDir) try { overlay = JSON.parse(readFileSync(join(overlayDir, domain + ".json"), "utf8")); } catch {}
  return intersect(committed, overlay);
}

// CLI: ratchet.mjs verdict --gate G --domain D [--repo DIR] [--strict-paths "/a /b"] [--overlay-dir DIR] [--legacy FILE] [--baseline FILE] [--today YYYY-MM-DD]
if (isMain(import.meta.url)) {
  const a = process.argv.slice(2); const opt = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
  if (a[0] === "needs-live") { const e = loadEffective(opt("domain"), { baselineFile: opt("baseline") || BASELINE_FILE, overlayDir: opt("overlay-dir") }); process.exit(needsLive(e) ? 0 : 1); }
  if (a[0] !== "verdict") { console.error("usage: ratchet.mjs verdict|needs-live --gate G --domain D [...]"); process.exit(2); }
  const gate = JSON.parse(readFileSync(opt("gate"), "utf8")); const domain = opt("domain");
  let legacyUncited = new Set(); try { legacyUncited = new Set(JSON.parse(readFileSync(opt("legacy"), "utf8")).claims.filter((c) => !c.has_source).map(claimKey)); } catch {}
  const entry = loadEffective(domain, { baselineFile: opt("baseline") || BASELINE_FILE, overlayDir: opt("overlay-dir") });
  let changed = []; if (opt("repo")) { const d = deployDiff(opt("repo")); if (d.warn) console.error(`WARN RATCHET ${d.warn}`); else changed = changedPages(d.diff, Object.keys(entry?.pages || {})); if (changed.length) console.error(`INFO RATCHET changed baselined pages since ${d.sha}: ${changed.join(" ")}`); }
  const r = evaluate({ gate, entry, strictPaths: (opt("strict-paths") || "").split(/\s+/).filter(Boolean), changed, today: opt("today") || isoDay(Date.now()), legacyUncited, liveGate: opt("live-gate") ? JSON.parse(readFileSync(opt("live-gate"), "utf8")) : undefined });
  for (const i of r.info) console.error(`INFO RATCHET ${i}`);
  if (r.shrunk && opt("overlay-dir") && !r.block.length) { mkdirSync(opt("overlay-dir"), { recursive: true }); writeFileSync(join(opt("overlay-dir"), domain + ".json"), JSON.stringify(r.shrunk, null, 1)); console.error(`INFO RATCHET SHRUNK ${domain}: ${r.fixed.length} fixed (${r.fixed.slice(0, 5).join("; ")}) -> ${opt("overlay-dir")}/${domain}.json, remaining ${r.shrunk.total}`); }
  const bl = entry ? `${entry.total ?? siteTotal(entry)} baselined, remove_by ${entry.remove_by}` : "no baseline";
  console.log(r.block.length ? `BLOCK ${r.block.length}: ${r.block.slice(0, 6).join(" ; ")}` : `PASS ratchet (${bl}; fixed ${r.fixed.length})`);
}
