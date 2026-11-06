// Keep gate runs out of visitor analytics: abort Cloudflare RUM, Google Analytics/GTM, and same-origin analytics POSTs
// in every gate context. Ads (AdSense) are blocked too so our bots never create ad impressions; each
// ins.adsbygoogle slot gets a fixed-size placeholder at its reserved size so CLS is still measured honestly.
const host = (h, d) => h === d || h.endsWith("." + d);
export function analyticsKind(u, method = "GET", pageUrl = "") {
  let x; try { x = new URL(u); } catch { return null; }
  if (host(x.hostname, "static.cloudflareinsights.com") && /^\/beacon\.min\.js(\/|$)/.test(x.pathname)) return "cf-beacon";
  if (x.pathname.startsWith("/cdn-cgi/rum")) return "cf-rum";
  if (host(x.hostname, "google-analytics.com")) return "google-analytics";
  if (host(x.hostname, "analytics.google.com")) return "analytics.google";
  if (host(x.hostname, "googletagmanager.com")) return "googletagmanager";
  if (host(x.hostname, "pagead2.googlesyndication.com")) return "ads-pagead2";
  if (host(x.hostname, "tpc.googlesyndication.com")) return "ads-tpc";
  if (host(x.hostname, "googleads.g.doubleclick.net")) return "ads-doubleclick";
  if (host(x.hostname, "adservice.google.com")) return "ads-adservice";
  if (host(x.hostname, "fundingchoicesmessages.google.com")) return "ads-fundingchoices";
  if (method === "POST" && /^\/api\/(analytics|rl-event)(\/|$)/.test(x.pathname)) {
    let same = true; try { same = !pageUrl || new URL(pageUrl).origin === x.origin; } catch {}
    if (same) return x.pathname.startsWith("/api/analytics") ? "api-analytics" : "api-rl-event";
  }
  return null;
}
export const isRum = (u) => { const k = analyticsKind(u); return k === "cf-beacon" || k === "cf-rum"; };
// Runs in-page: stub adsbygoogle and give each ad slot a placeholder at the slot's reserved size
// (inline/CSS width+height, else data-ad-format default), so layout matches a reserved slot without a real ad.
export const AD_PLACEHOLDER = `(() => {
  window.adsbygoogle = window.adsbygoogle || []; window.adsbygoogle.push = () => 0; window.adsbygoogle.loaded = true;
  const fill = (el) => { if (el.dataset.gatePh) return; el.dataset.gatePh = "1";
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const w = r.width || parseFloat(cs.width) || el.parentElement?.clientWidth || 300;
    const h = r.height || parseFloat(cs.minHeight) || parseFloat(cs.height) || 0;
    const ph = document.createElement("div"); ph.setAttribute("data-gate-ad-placeholder", "");
    ph.style.cssText = "display:block;width:" + w + "px;height:" + h + "px;max-width:100%;background:transparent";
    el.appendChild(ph); console.log("gate-ad-placeholder " + Math.round(w) + "x" + Math.round(h)); };
  const scan = () => document.querySelectorAll("ins.adsbygoogle").forEach(fill);
  new MutationObserver(scan).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scan);
})();`;
export async function blockRum(ctx, tag = "") {
  await ctx.addInitScript(AD_PLACEHOLDER);
  ctx.on("page", (p) => p.on("console", (m) => { const t = m.text(); if (t.startsWith("gate-ad-placeholder")) console.error(`rum-block: ${t} ${tag} ${p.url().split("?")[0]}`); }));
  await ctx.route("**/*", (route) => {
    const r = route.request(); let pu = ""; try { pu = r.frame().url(); } catch {}
    const k = analyticsKind(r.url(), r.method(), pu);
    if (!k) return route.fallback();
    console.error(`rum-block: aborted [${k}] ${tag ? tag + " " : ""}${r.url().split("?")[0]}`);
    return route.abort("blockedbyclient");
  });
}
