#!/usr/bin/env node
// Remaining subpage-ratchet baseline per site (committed ∩ local shrink overlay), worst first.
// Usage: baseline-count.mjs [--overlay-dir DIR] [--baseline FILE] [--today YYYY-MM-DD]  -> JSON on stdout
import { readFileSync } from "node:fs";
import { BASELINE_FILE, loadEffective, siteTotal, isoDay } from "./ratchet.mjs";
export function counts(baselineFile, overlayDir, today) {
  const sites = Object.keys(JSON.parse(readFileSync(baselineFile, "utf8")).sites || {});
  const rows = sites.map((s) => { const e = loadEffective(s, { baselineFile, overlayDir });
    return { site: s, remaining: siteTotal(e), pages: Object.keys(e?.pages || {}).length, remove_by: e?.remove_by, overdue: !!(e?.remove_by && today > e.remove_by && siteTotal(e) > 0) }; })
    .sort((a, b) => b.remaining - a.remaining || a.site.localeCompare(b.site));
  return { at: new Date().toISOString(), today, total: rows.reduce((a, r) => a + r.remaining, 0), sites: rows };
}
const a = process.argv.slice(2); const opt = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : undefined; };
console.log(JSON.stringify(counts(opt("baseline") || BASELINE_FILE, opt("overlay-dir"), opt("today") || isoDay(Date.now())), null, 1));
