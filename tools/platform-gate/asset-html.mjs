// asset_html_fallback rule (narrowed, Keeper 2026-10-22). A .js/.json/.webmanifest answering Content-Type text/html (any
// status) is usually an SPA/HTML fallback serving index.html in place of the asset.
//  BLOCK (kind asset_html_fallback, never baselined): paths the rendered home page actually references — same-site
//    <script src>, <link rel~=manifest href>, and service-worker scripts it registers via navigator.serviceWorker.register(...)
//    — plus, on sites flagged `_pwaKit: true` in config/domains.json (home-screen app kit live), PWA_KIT_PATHS even if unlinked.
//  WARN (kind asset_html_warn, no defects, never blocks): the unreferenced probe paths in PROBE_PATHS.
// Fetch errors are not findings. Pure helpers are exported for unit tests; gate.mjs supplies the DOM data and a fetch.
export const PROBE_PATHS = ["/sw.js", "/manifest.json", "/manifest.webmanifest", "/site.webmanifest"];
export const KNOWN_ASSET_PATHS = PROBE_PATHS; // back-compat alias
export const PWA_KIT_PATHS = ["/sw.js", "/manifest.webmanifest"];
export const ASSET_RE = /\.(js|json|webmanifest)$/i;
const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
export const isHtml = (ct) => /^\s*text\/html\b/i.test(String(ct || ""));
// script texts (inline + same-site bundles) -> raw URLs passed to navigator.serviceWorker.register("...")
export function swRegisterUrls(texts) {
  const out = new Set(); const re = /serviceWorker\s*\.\s*register\s*\(\s*(["'`])([^"'`]+)\1/g;
  for (const t of texts || []) for (const m of String(t || "").matchAll(re)) out.add(m[2]);
  return [...out];
}
// referenced: URLs/hrefs (absolute or relative) the home page references; returns sorted same-site asset paths
export function referencedPaths(referenced, baseUrl, siteHost) {
  const base = new URL(baseUrl); const out = new Set();
  for (const href of referenced || []) { try { const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) continue;
    if (u.origin !== base.origin && bare(u.hostname) !== bare(siteHost)) continue;
    if (ASSET_RE.test(u.pathname)) out.add(u.pathname + u.search); } catch {} }
  return [...out].sort();
}
// -> { block: [...paths], warn: [...paths] }
export function assetPlan({ referenced, baseUrl, siteHost, pwaKit = false }) {
  const block = new Set(referencedPaths(referenced, baseUrl, siteHost));
  if (pwaKit) for (const p of PWA_KIT_PATHS) block.add(p);
  const warn = PROBE_PATHS.filter((p) => !block.has(p));
  return { block: [...block].sort(), warn };
}
// legacy: all paths (block ∪ probe)
export function assetPaths(linked, baseUrl, siteHost) { return [...new Set([...PROBE_PATHS, ...referencedPaths(linked, baseUrl, siteHost)])].sort(); }
const finding = (kind, p, r, why) => ({ kind, route: p, status: r.status, match: p,
  text: `asset ${p} (${why}) returned HTTP ${r.status} Content-Type ${r.contentType}`,
  defects: kind === "asset_html_fallback" ? [`asset_html_fallback: ${p} returned HTTP ${r.status} with Content-Type text/html (${why})`] : [] });
// probe(path) -> { status, contentType }. paths = block list (legacy arg), warn = warn-only list.
export async function assetHtmlFallback({ paths = [], warn = [], probe, why = "referenced by home" }) {
  const findings = []; const warnings = [];
  for (const [list, kind, out] of [[paths, "asset_html_fallback", findings], [warn, "asset_html_warn", warnings]]) for (const p of list) {
    let r; try { r = await probe(p); } catch { continue; }
    if (!r || !isHtml(r.contentType)) continue;
    out.push(finding(kind, p, r, kind === "asset_html_warn" ? "unreferenced probe" : why));
  }
  return Object.defineProperty(findings, "warnings", { value: warnings, enumerable: false });
}
