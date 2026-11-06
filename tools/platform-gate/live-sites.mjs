// Live-site list for the daily mobile check, derived from the source of truth: the wrangler
// config each site repo deploys with (routes / custom domains). No hand-kept list.
// Wrangler precedence per repo: wrangler.json > wrangler.jsonc > wrangler.toml (first found wins).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CONFIGS = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"];
export const bareHost = (h) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

export function stripJsonc(src) {
  let out = "", i = 0, str = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (str) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[\]}])/g, "$1");
}

// Top-level routes only (production). [env.*] sections are not production unless deployed with --env.
// Handles `route = "..."`, single- and multi-line `routes = [ "...", { pattern = "..." } ]` and [[routes]] tables.
export function tomlRoutes(src) {
  const pats = []; let section = ""; let inArr = false;
  for (const raw of src.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    if (inArr) { for (const m of line.matchAll(/(?:pattern\s*=\s*)?"([^"]+)"/g)) if (!/zone_name\s*=\s*$/.test(line.slice(0, m.index))) pats.push(m[1]); if (line.includes("]")) inArr = false; continue; }
    const sec = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?$/); if (sec) { section = sec[1]; continue; }
    if (section === "routes") { const m = line.match(/^pattern\s*=\s*"([^"]+)"/); if (m) pats.push(m[1]); continue; }
    if (section === "") {
      const one = line.match(/^route\s*=\s*"([^"]+)"/); if (one) pats.push(one[1]);
      const arr = line.match(/^routes\s*=\s*\[(.*)$/);
      if (arr) { for (const m of arr[1].matchAll(/(?:pattern\s*=\s*)?"([^"]+)"/g)) if (!/zone_name\s*=\s*$/.test(arr[1].slice(0, m.index))) pats.push(m[1]); if (!arr[1].includes("]")) inArr = true; }
    }
  }
  return pats;
}

export function routePatterns(file, src) {
  if (file.endsWith(".toml")) return tomlRoutes(src);
  const cfg = JSON.parse(stripJsonc(src));
  const list = [...(cfg.routes || []), ...(cfg.route ? [cfg.route] : [])];
  return list.map((r) => (typeof r === "string" ? r : r?.pattern)).filter(Boolean);
}

// A pattern becomes a host; wildcards and workers.dev are not sites.
export function patternHost(p) {
  const h = String(p).replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  if (!h || h.includes("*") || h.endsWith(".workers.dev") || !h.includes(".")) return null;
  return h;
}

// Returns [{ site, url, repo, config, hosts }] one per bare host, plus errors for unreadable configs.
export function liveSites(workspace) {
  if (!existsSync(workspace)) throw new Error(`workspace not found: ${workspace}`);
  const bySite = new Map(); const errors = [];
  for (const repo of readdirSync(workspace).sort()) {
    const dir = join(workspace, repo);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    const cfg = CONFIGS.find((f) => existsSync(join(dir, f))); if (!cfg) continue;
    let pats;
    try { pats = routePatterns(cfg, readFileSync(join(dir, cfg), "utf8")); }
    catch (e) { errors.push({ repo, config: cfg, error: `unreadable ${cfg}: ${e.message.slice(0, 120)}` }); continue; }
    for (const host of pats.map(patternHost).filter(Boolean)) {
      const site = bareHost(host);
      const s = bySite.get(site) || { site, repo, config: cfg, hosts: new Set() };
      s.hosts.add(host); bySite.set(site, s);
    }
  }
  const sites = [...bySite.values()].map((s) => {
    const hosts = [...s.hosts].sort();
    // Prefer the apex route; the live redirect (apex<->www) is followed and allowed by sameSite.
    const host = hosts.includes(s.site) ? s.site : hosts[0];
    return { site: s.site, url: `https://${host}/`, repo: s.repo, config: s.config, hosts };
  }).sort((a, b) => a.site.localeCompare(b.site));
  return { sites, errors };
}

// Cloudflare registry (live-truth state/live/cf/domains.json, schema live-truth/domains/v1).
// A domain is live when its zone is active and a Worker route or custom domain serves it.
// Throws if the registry is missing, not ok, or does not list routes/custom domains: never silently empty.
export function registrySites(doc) {
  if (!doc || doc.schema !== "live-truth/domains/v1") throw new Error("registry: wrong or missing schema");
  if (doc.status && doc.status !== "ok") throw new Error(`registry status ${doc.status}: ${doc.reason || ""}`.trim());
  if (!Array.isArray(doc.rows) || !doc.rows.length) throw new Error("registry has no rows");
  const out = [];
  for (const r of doc.rows) {
    if (!r.on_cloudflare || (r.zone_status && r.zone_status !== "active")) continue;
    if ((r.flags || []).includes("excluded")) continue;
    if (r.routes === null || r.custom_domains === null) throw new Error(`registry: routes/custom domains unknown for ${r.domain}`);
    const hosts = [...(r.custom_domains || []).map((c) => c.hostname), ...(r.routes || []).map((x) => patternHost(x.pattern))].filter(Boolean).map((h) => h.toLowerCase());
    const own = hosts.filter((h) => bareHost(h) === bareHost(r.domain));
    if (!own.length) continue;
    out.push({ site: bareHost(r.domain), hosts: [...new Set(own)].sort() });
  }
  return out;
}

// Union of the Cloudflare registry and the wrangler configs. Registry problems are returned as errors
// (the daily run counts them as failures) and the wrangler list is still checked.
export function allLiveSites({ workspace, registry }) {
  const { sites, errors } = liveSites(workspace);
  const by = new Map(sites.map((s) => [s.site, { ...s, source: ["wrangler"] }]));
  let reg = [];
  try { reg = registrySites(registry); } catch (e) { errors.push({ repo: "cloudflare-registry", error: e.message }); }
  for (const r of reg) {
    const cur = by.get(r.site);
    if (cur) { cur.source.push("cloudflare"); continue; }
    const host = r.hosts.includes(r.site) ? r.site : r.hosts[0];
    by.set(r.site, { site: r.site, url: `https://${host}/`, repo: null, config: null, hosts: r.hosts, source: ["cloudflare"] });
  }
  return { sites: [...by.values()].sort((a, b) => a.site.localeCompare(b.site)), errors };
}
