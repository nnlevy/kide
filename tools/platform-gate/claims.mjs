// Shared claim / citation logic for the domains platform ship gate.
// Pure (no browser): fed "blocks" ({text, links, cites, footnotes, attrs, ownPriceTexts, page}) extracted in-page.
// Rules (Synergy review): a claim is any figure, date-bound fact, ranking, legal rule or present-tense status.
// Site's own prices/SKUs are exempt. Each claim needs source_url, as_of, recheck_by, tier; recheck_by must be
// in the future and no further than the tier's max interval after as_of; a stored source hash/quote must still
// match the fetched source.
import { createHash } from "node:crypto";

export const TIERS = { status: 7, news: 7, conflict: 7, memorial: 7, price: 30, rate: 30, law: 180, standard: 180, constant: 365 };
const DAY = 864e5;

const UNITS = "gallons?|gal|liters?|litres?|gpus?|tb|gb|mb|kwh|mwh|gw|mw|kw|watts?|miles?|mi|km|feet|ft|sq ?ft|acres?|tons?|lbs?|pounds?|kg|users?|customers?|homes?|households?|people|businesses|companies|sites?|domains?|students?|members?|x|times|mbps|gbps|ms|tokens?|requests?|percent";
const FIG = new RegExp(String.raw`(?:[$€£₪]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|b|bn|million|billion|trillion)?(?:\s?\/\s?\w+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|(?:k|m|b|bn|million|billion|trillion)\b|\+?\s?(?:${UNITS})\b)|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b(?!\s*(?:[-–]\s*\d|\)|$)))`, "gi");
const RANK = /(#\s?\d+\b|\bno\.\s?1\b|\bnumber one\b|\btop \d+\b|\b(?:largest|biggest|fastest|cheapest|best[- ]rated|most popular|leading)\b)/gi;
const LAW = /\b(required by law|by law|illegal|legally required|statute|regulation|regulations|code (?:§|section)|section \d+|§\s?\d+|IRS|FCC|EPA|HIPAA|GDPR|ADA)\b/gi;
const STATUS = /\b(?:is|are|now) (?:live|home|open|available|closed|released|missing|held|in effect)\b|\bavailable in\b|\bnow serving\b|\bcurrently\b/gi;

// Things that look numeric but are not claims.
const DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b(?!\s*%)/gi;
const ADDRESS = /\b\d{1,6}\s+(?:[A-Z][\w.']*\s+){1,5}(?:Blvd|Boulevard|St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Way|Ln|Lane|Ct|Court|Pkwy|Parkway|Hwy|Pl|Place|Sq|Square|Suite|Ste)\b\.?/g;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const ZIP = /\b(?:zip|zip code|postal)\s*:?\s*\d{5}(?:-\d{4})?\b/gi;
const UI = /\b(?:step|page|part|chapter|question|lesson|level|tier|plan|day|week|module|section|item|slide|round|q)\s?\d+(?:\s?(?:of|\/)\s?\d+)?\b|\b\d+\s?\/\s?\d+\b(?=\s*(?:done|complete|answered|steps?)?\b)|\b\d+\s?(?:min|minute)s?\s+read\b|©\s?\d{4}/gi;

export const DEFAULT_CONFIG = { ownPricePaths: ["/buy", "/credits", "/pricing", "/checkout", "/pack", "/packs", "/plans", "/subscribe", "/order", "/cart"], ownPrices: [], ownSkus: [], allowPatterns: [], allowPages: [] };
export function domainConfig(all, host) {
  const h = String(host || "").replace(/^www\./, "");
  const d = (all && (all[h] || all["*"])) || {};
  const base = { ...DEFAULT_CONFIG, ...(all?.["*"] || {}) };
  const portfolioDomains = [...new Set([...Object.keys(all || {}).filter((k) => k !== "*" && !k.startsWith("_")), ...(all?._portfolio?.portfolioDomains || []), ...(base.portfolioDomains || [])])];
  return { ...base, ...d, portfolioDomains, ownPricePaths: [...new Set([...(base.ownPricePaths || []), ...(d.ownPricePaths || [])])] };
}
export const isOwnPriceHref = (href, cfg, host) => {
  try { const u = new URL(href, `https://${host || "x.invalid"}`); if (host && u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) return /stripe\.com|checkout|buy\.|gumroad|lemonsqueezy/.test(u.hostname + u.pathname);
    return cfg.ownPricePaths.some((p) => u.pathname === p || u.pathname.startsWith(p.endsWith("/") ? p : p + "/") || u.pathname.startsWith(p + "-") || u.pathname.startsWith(p)); } catch { return false; }
};

function mask(text, cfg) {
  let t = ` ${String(text).replace(/\s+/g, " ")} `;
  const esc = (x) => String(x).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  for (const p of [...(cfg.ownPrices || []), ...(cfg.ownSkus || [])]) t = t.replace(new RegExp(esc(p) + "(?![\\d.,]*\\d)", "gi"), (m) => " ".repeat(m.length));
  for (const re of [ADDRESS, PHONE, ZIP, UI, DATE, ...(cfg.allowPatterns || []).map((p) => new RegExp(p, "gi"))]) t = t.replace(re, (m) => " ".repeat(m.length));
  return t;
}
const hits = (re, t) => [...t.matchAll(re)].map((m) => m[0].trim()).filter(Boolean);

export function suggestTier(text, kind) {
  const t = text.toLowerCase();
  if (/memorial|killed|murdered|hostage|fallen|yahrzeit|in memory/.test(t)) return "memorial";
  if (/\bwar\b|ceasefire|idf|hamas|attack|conflict|strike/.test(t)) return "conflict";
  if (kind === "status") return "status";
  if (kind === "law" || /\blaw\b|regulation|statute|rule\b|standard|code\b/.test(t)) return /standard|iso|ansi|nfpa|ul\b|ieee/.test(t) ? "standard" : "law";
  if (/[$€£₪]|price|cost|\/mo|per month|per hour|\/hr|fee|rate|apr|interest/.test(t)) return /rate|apr|interest|%/.test(t) ? "rate" : "price";
  if (/boil|freez|speed of light|gravity|density|joule|psi\b|btu|watts? per|ohm|newton/.test(t)) return "constant";
  return "news";
}
export function escalation(text) {
  const t = text.toLowerCase(), out = [];
  if (/[$€£₪]|price|cost|fee|refund|pay|salary|income|revenue|loan|debt|tax|apr|interest|save|savings/.test(t)) out.push("money");
  if (/memorial|killed|murdered|hostage|fallen|yahrzeit|in memory|victim/.test(t)) out.push("memorial");
  if (/israel|gaza|hamas|election|government|president|congress|party|war\b|idf|political/.test(t)) out.push("political");
  if (/medical|health|doctor|drug|fda|diagnos|treat|legal|law|attorney|lawsuit|court|statute|regulat|hipaa/.test(t)) out.push("medical-legal");
  return out;
}

/** Extract claims from one block. */
export function extractClaims(block, cfg = DEFAULT_CONFIG) {
  const ownTexts = block.ownPriceTexts || [];
  let text = block.text || "";
  for (const o of ownTexts) text = text.split(o).join(" ".repeat(o.length)); // prices inside own /buy links/buttons
  // currency amounts inside an explicit [data-own-price] marker (exact amount, not a prefix of a longer number; one occurrence per marked occurrence)
  const escA = (x) => String(x).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  for (const a of block.ownPriceAmounts || []) if (/^[$€£₪]\s?\d/.test(String(a).trim())) text = text.replace(new RegExp(escA(a) + "(?![\\d.,]*\\d)"), (m) => " ".repeat(m.length));
  // calculator outputs in a [data-estimate] marker whose every input is cited (validated in extract-blocks)
  for (const e of block.estimateTexts || []) { const x = String(e); if (x.includes(text) && x.trim()) text = " ".repeat(text.length); else text = text.split(x).join(" ".repeat(x.length)); }
  const masked = mask(text, cfg);
  const found = [];
  for (const m of hits(FIG, masked)) found.push({ kind: "figure", match: m });
  for (const m of hits(RANK, masked)) found.push({ kind: "ranking", match: m });
  for (const m of hits(LAW, masked)) found.push({ kind: "law", match: m });
  for (const m of hits(STATUS, masked)) found.push({ kind: "status", match: m });
  return found.map((f) => ({ ...f, text: (block.text || "").trim().replace(/\s+/g, " ").slice(0, 240), page: block.page }));
}

const bare = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
/** True when href points at the site itself or any of Nir's own portfolio domains (never a citation). */
export function isOwnDomain(href, host, cfg = {}) {
  let h; try { h = bare(new URL(href).hostname); } catch { return true; }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(h) || h.endsWith(".workers.dev") || h.endsWith(".pages.dev")) return true;
  const own = [host, ...(cfg.portfolioDomains || [])].filter(Boolean).map(bare);
  return own.some((d) => h === d || h.endsWith("." + d));
}
export function citationOf(block, cfg = {}) {
  const a = block.attrs || {};
  const ext = (block.links || []).find((h) => /^https?:/i.test(h) && !isOwnDomain(h, block.host, cfg));
  const ds = a["data-source"] && /^https?:/i.test(a["data-source"]) && isOwnDomain(a["data-source"], block.host, cfg) ? null : a["data-source"];
  const source_url = ds || a.source_url || ext || (block.cites || [])[0] || null;
  const has_source = !!(source_url || (block.footnotes || []).length || (block.cites || []).length);
  return { has_source, source_url, as_of: a["data-as-of"] || a.as_of || null, recheck_by: a["data-recheck-by"] || a.recheck_by || null, tier: a["data-tier"] || a.tier || null, source_hash: a["data-source-hash"] || a.source_hash || null, source_quote: a["data-source-quote"] || a.source_quote || null };
}

export const sha256 = (s) => createHash("sha256").update(String(s).replace(/\s+/g, " ").trim()).digest("hex");

/** Evaluate one claim's citation metadata. Returns list of defect strings (empty = pass). */
export async function evaluateClaim(claim, meta, { now = new Date(), fetchSource = null, requireMetadata = false } = {}) {
  const d = [];
  if (!meta.has_source) { d.push("uncited"); return d; }
  if (!requireMetadata) return d;
  for (const k of ["source_url", "as_of", "recheck_by", "tier"]) if (!meta[k]) d.push(`missing ${k}`);
  if (meta.tier && !TIERS[meta.tier]) d.push(`unknown tier ${meta.tier}`);
  const asOf = Date.parse(meta.as_of), rb = Date.parse(meta.recheck_by);
  if (meta.recheck_by && Number.isNaN(rb)) d.push("bad recheck_by");
  if (!Number.isNaN(rb) && rb < now.getTime()) d.push(`recheck_by ${meta.recheck_by} is past`);
  if (TIERS[meta.tier] && !Number.isNaN(rb) && !Number.isNaN(asOf) && rb - asOf > TIERS[meta.tier] * DAY) d.push(`recheck_by exceeds ${meta.tier} max ${TIERS[meta.tier]}d`);
  if (fetchSource && meta.source_url && (meta.source_hash || meta.source_quote)) {
    let body = null; try { body = await fetchSource(meta.source_url); } catch (e) { d.push(`source fetch failed: ${String(e.message || e).slice(0, 60)}`); }
    if (body != null) {
      const norm = String(body).replace(/\s+/g, " ");
      if (meta.source_quote && !norm.includes(meta.source_quote.replace(/\s+/g, " ").trim())) d.push("source quote no longer in source");
      if (meta.source_hash && !meta.source_quote && sha256(body) !== meta.source_hash) d.push("source hash changed");
    }
  }
  return d;
}

/** Load a per-page claims JSON ({claims:[{match|text, source_url, as_of, recheck_by, tier, source_quote|source_hash}]}) and attach to block claims. */
export function mergeClaimsJson(claims, json) {
  const list = json?.claims || [];
  return claims.map((c) => { const m = list.find((j) => (j.match && c.text.includes(j.match)) || (j.text && c.text.includes(j.text))); return m ? { ...c, meta: { has_source: !!m.source_url, ...m } } : c; });
}

/** Full evaluation over blocks. */
export async function auditBlocks(blocks, cfg, opts = {}) {
  const claims = [];
  for (const b of blocks) {
    if ((cfg.allowPages || []).some((p) => b.pagePath === p || (p.endsWith("*") && b.pagePath?.startsWith(p.slice(0, -1))))) continue;
    if (b.demo) continue;
    const meta = citationOf(b, cfg);
    for (const c of extractClaims(b, cfg)) claims.push({ ...c, meta });
  }
  const merged = opts.claimsJson ? mergeClaimsJson(claims, opts.claimsJson) : claims;
  for (const c of merged) { c.defects = await evaluateClaim(c, c.meta, opts); c.tier_suggested = suggestTier(c.text, c.kind); c.escalation = escalation(c.text); }
  return merged;
}
