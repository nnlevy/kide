// Visible-text rule: fail when page copy names one of Nir's own portfolio domains as the billing/credits provider
// (e.g. "Credits & billing via riskfreetrial", "credits by riskfreetrial.org"). Operates ONLY on visible text
// (document.body.innerText); href and other attribute values are never inspected, so linking buyers to
// riskfreetrial.org with neutral link text is fine. Domain list = domainConfig().portfolioDomains (config/domains.json).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function providerNames(domains = []) {
  const out = new Set();
  for (const d of domains) { const b = String(d).toLowerCase().replace(/^www\./, ""); out.add(b); const label = b.split(".")[0]; if (label.length >= 5) out.add(label); }
  return [...out].sort((a, b) => b.length - a.length);
}
const TOPIC = String.raw`(?:billing|billed|payments?|paid|checkout|credits?|top[- ]?ups?|refunds?|subscriptions?|balance)`;
const LINK = String.raw`(?:via|by|through|thru|from|with|at|on|handled by|managed by|powered by|processed by|provided by)`;
export function billingProviderLeaks(visibleText, domains = []) {
  const names = providerNames(domains); if (!names.length) return [];
  const N = `(?:www\\.)?(?:${names.map(esc).join("|")})\\b`;
  const t = String(visibleText || "").replace(/\s+/g, " ");
  const res = [new RegExp(String.raw`\b${TOPIC}\b[^.·|\n]{0,40}?\b${LINK}\b[^.·|\n]{0,40}?[\s(\[]${N}`, "gi"),
               new RegExp(String.raw`\b${N}[^.·|\n]{0,12}?\b(?:credits?|billing|payments?|checkout)\s+(?:account|hub|provider)\b`, "gi")];
  const found = new Set(); for (const re of res) for (const m of t.matchAll(re)) found.add(m[0].trim());
  return [...found].map((match) => ({ kind: "billing-provider-text", match, defects: [`visible text names own domain as billing/credits provider: "${match}"`] }));
}
