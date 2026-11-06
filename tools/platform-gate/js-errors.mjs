// js_error rule: any uncaught page error (incl. SyntaxError) on a checked page fails the gate, unless it comes from a
// third-party script (AdSense/Google ads, Cloudflare beacon, any other off-site host). Ignored errors are kept and logged.
// Pure helpers; gate.mjs collects `pageerror` events from the same headless Playwright load it already does.
const bare = (h) => String(h || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
export const KNOWN_THIRD_PARTY = [/(^|\.)googlesyndication\.com$/, /(^|\.)doubleclick\.net$/, /(^|\.)googleadservices\.com$/, /(^|\.)google\.com$/, /(^|\.)gstatic\.com$/, /(^|\.)googletagmanager\.com$/, /(^|\.)google-analytics\.com$/, /(^|\.)adtrafficquality\.google$/, /^static\.cloudflareinsights\.com$/, /^cloudflareinsights\.com$/];
export const stackUrls = (stack) => [...String(stack || "").matchAll(/(https?:\/\/[^\s)'"]+?)(?::\d+){0,2}(?=[\s)'"]|$)/g)].map((m) => m[1]);
// same site = page origin or apex/www of the audited domain; /cdn-cgi/ (Cloudflare-injected beacon/challenge) is third-party
export function isFirstPartyUrl(u, pageUrl, siteHost) {
  let x; try { x = new URL(u); } catch { return false; } const p = new URL(pageUrl);
  if (/^\/cdn-cgi\//.test(x.pathname)) return false;
  return x.origin === p.origin || bare(x.hostname) === bare(siteHost || p.hostname);
}
export function classifyPageError({ name, message, stack }, pageUrl, siteHost) {
  const urls = stackUrls(stack); const first = urls.find((u) => isFirstPartyUrl(u, pageUrl, siteHost));
  const err = { name: name || "Error", message: String(message || "").split("\n")[0].slice(0, 200), source: first || urls[0] || null };
  // no script URL at all (inline script / eval / syntax error in an inline block) is first-party: the page shipped it
  // AdSense throws its own TagError class (adsbygoogle.push) with no stack: attribute it to AdSense
  if (!first && err.name === "TagError") return { ...err, source: err.source || "adsense:TagError", thirdParty: true, known: true };
  if (!urls.length || first) return { ...err, thirdParty: false };
  const host = (() => { try { return new URL(urls[0]).hostname; } catch { return ""; } })();
  return { ...err, thirdParty: true, known: KNOWN_THIRD_PARTY.some((re) => re.test(host)) };
}
export function jsErrorFindings(errors, pageUrl, siteHost) {
  const all = errors.map((e) => classifyPageError(e, pageUrl, siteHost)); const seen = new Set(); const fails = [];
  for (const e of all.filter((x) => !x.thirdParty)) { const k = `${e.name}|${e.message}`; if (seen.has(k)) continue; seen.add(k);
    fails.push({ kind: "js_error", page: pageUrl, match: `${e.name}: ${e.message}`.slice(0, 120), text: `${e.name}: ${e.message}${e.source ? ` @ ${e.source}` : ""}`, defects: [`js_error: uncaught ${e.name}: ${e.message}`] }); }
  return { findings: fails, ignored: all.filter((x) => x.thirdParty).map((e) => ({ page: pageUrl, ...e })) };
}
