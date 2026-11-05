// orphan_tools rule: a LIVE tool route (HTTP < 400) with zero inbound links from the home page (rendered DOM,
// which includes the site nav/header/footer) fails the gate. Tool routes come from config/domains.json
// `_toolRoutes[<domain>]` (explicit list) plus any sitemap.xml path matching `_toolRoutes._patterns`.
// Pure helpers are exported for unit tests; gate.mjs supplies the rendered home hrefs and a fetch.
export const DEFAULT_TOOL_PATTERNS = ["^/tools?/[^/]+", "-(calculator|checker|estimator|diagnosis|quiz|generator|ritual|tool)$"];
export const normPath = (p) => { const s = String(p || "/").split(/[?#]/)[0] || "/"; return s.length > 1 ? s.replace(/\/+$/, "") : "/"; };
const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
export function toolRoutesFor(all, host, sitemapPaths = []) {
  const tr = all?._toolRoutes || {}; const h = bare(host);
  const pats = (tr._patterns || DEFAULT_TOOL_PATTERNS).map((p) => new RegExp(p, "i"));
  // deploy.sh may pass the bare repo name ("trycrm") as the domain: fall back to the configured key with that first label
  const key = tr[h] ? h : Object.keys(tr).find((k) => !k.startsWith("_") && k.split(".")[0] === h);
  const out = new Set(((key && tr[key]) || []).map(normPath));
  for (const p of sitemapPaths) { const n = normPath(p); if (n !== "/" && pats.some((re) => re.test(n))) out.add(n); }
  return [...out].sort();
}
export function sitemapPaths(xml) { return [...String(xml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => { try { return new URL(m[1]).pathname; } catch { return null; } }).filter(Boolean); }
// homeHrefs: absolute hrefs from the rendered home DOM (a[href]); siteHost: the audited domain; baseUrl: where it was loaded
export function inboundPaths(homeHrefs, baseUrl, siteHost) {
  const base = new URL(baseUrl); const out = new Set();
  for (const href of homeHrefs || []) { try { const u = new URL(href, base);
    if (u.origin === base.origin || bare(u.hostname) === bare(siteHost)) out.add(normPath(u.pathname)); } catch {} }
  return out;
}
// statusOf(path) -> HTTP status (number). Non-live routes (>=400 or fetch error) are not orphans: there is nothing to link.
export async function orphanTools({ toolRoutes, homeHrefs, baseUrl, siteHost, statusOf }) {
  const inbound = inboundPaths(homeHrefs, baseUrl, siteHost); const findings = [];
  for (const r of toolRoutes) {
    if (inbound.has(r)) continue;
    let st = 0; try { st = await statusOf(r); } catch { st = 0; }
    if (!st || st >= 400) continue;
    findings.push({ kind: "orphan_tools", route: r, status: st, match: r, text: `live tool route ${r} (HTTP ${st}) has zero inbound links from home/nav`,
      defects: [`orphan_tools: live tool route ${r} has zero inbound links from the home page or nav`] });
  }
  return findings;
}
