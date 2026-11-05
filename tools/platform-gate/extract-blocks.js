// Runs in the page (Playwright page.evaluate). Returns paragraph/card blocks with citation evidence.
// Exported as a string-free function so tests can run it under jsdom if desired.
function extractBlocks(cfg) {
  const host = (cfg.siteHost || location.hostname).replace(/^www\./, "");
  const own = (href) => { try { const u = new URL(href, location.href); const p = u.pathname; const same = u.hostname.replace(/^www\./, "") === host || u.hostname === location.hostname;
    return (same && cfg.ownPricePaths.some((x) => p === x || p.startsWith(x))) || /stripe\.com|gumroad|lemonsqueezy/.test(u.hostname); } catch { return false; } };
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const SEL = "p, li, td, th, blockquote, figcaption, dd, h1, h2, h3, h4, [class*=card], [class*=Card], [class*=stat], [class*=tile], [data-claim]";
  const ownPage = cfg.ownPricePaths.some((x) => location.pathname === x || location.pathname.startsWith(x));
  // Split at sentence ends into <= MAX chars; an over-long sentence splits at whitespace (never inside a token).
  const MAX = 1500;
  const CURRENCY = /[$€£₪]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|b)\b)?(?:\s?\/\s?[a-z]+)?/gi;
  const chunk = (t) => {
    if (t.length <= MAX) return [t];
    const parts = []; let cur = "";
    const push = (x) => { const y = x.trim(); if (y) parts.push(y); };
    for (const sent of t.split(/(?<=[.!?\u3002])\s+|\n+/)) {
      if (sent.length > MAX) {
        push(cur); cur = "";
        let rest = sent;
        while (rest.length > MAX) { let cut = rest.lastIndexOf(" ", MAX); if (cut < MAX / 2) cut = MAX; push(rest.slice(0, cut)); rest = rest.slice(cut); }
        cur = rest;
      } else if ((cur + " " + sent).length > MAX) { push(cur); cur = sent; } else cur = cur ? cur + " " + sent : sent;
    }
    push(cur);
    return parts;
  };
  // Calculator-output marker (CoS 2026-10-22): an element with [data-estimate] that shows the visible label
  // "Your estimate" and lists the ids of every input feeding its formula in data-estimate-inputs="id1 id2".
  // Its numbers are skipped ONLY when every listed input is cited (external link / <cite> / footnote ref /
  // non-own data-source on the input, its <label>, aria-describedby target, or enclosing field/p/li/td/dd/fieldset).
  const portfolio = (cfg.portfolioDomains || []).map((d) => String(d).replace(/^www\./, "").toLowerCase());
  const extHref = (href) => { try { const u = new URL(href, location.href); if (!/^https?:$/.test(u.protocol)) return false; const h = u.hostname.replace(/^www\./, "").toLowerCase();
    return !(h === host || h === location.hostname || /^(localhost|127\.0\.0\.1)$/.test(h) || h.endsWith(".workers.dev") || h.endsWith(".pages.dev") || portfolio.some((d) => h === d || h.endsWith("." + d))); } catch { return false; } };
  const evidence = (n) => !!n && (
    (n.getAttribute?.("data-source") && (!/^https?:/i.test(n.getAttribute("data-source")) || extHref(n.getAttribute("data-source")))) ||
    (n.matches?.("a[href]") && extHref(n.href)) || (n.matches?.('a[href^="#"], a[role=doc-noteref], [data-footnote-ref]')) ||
    [...(n.querySelectorAll?.("a[href]") || [])].some((a) => extHref(a.href) || /^#/.test(a.getAttribute("href") || "") || a.getAttribute("role") === "doc-noteref") ||
    (n.querySelectorAll?.("cite, [cite], [data-footnote-ref]") || []).length > 0 ||
    [...(n.querySelectorAll?.("[data-source]") || [])].some((d) => !/^https?:/i.test(d.getAttribute("data-source")) || extHref(d.getAttribute("data-source"))));
  const inputCited = (id) => { const n = document.getElementById?.(id); if (!n) return false;
    const scopes = [n, n.closest?.("label"), ...(document.querySelectorAll?.(`label[for="${id}"]`) || []), n.closest?.("p, li, td, dd, fieldset, [data-estimate-input]"),
      ...String(n.getAttribute?.("aria-describedby") || "").split(/\s+/).filter(Boolean).map((d) => document.getElementById?.(d))];
    return scopes.some(evidence); };
  const estimateOk = (m) => { const ids = String(m.getAttribute?.("data-estimate-inputs") || "").split(/[\s,]+/).filter(Boolean);
    return /your estimate/i.test(m.innerText || "") && ids.length > 0 && ids.every(inputCited); };
  const out = []; const seen = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    if (!vis(el) || el.closest("nav, footer, header, [aria-hidden=true], script, style, noscript, [data-demo], .example-data")) continue;
    // a card containing p/li is evaluated as a container for citation, but text claims come from the leaf
    const leafy = el.matches("[class*=card],[class*=Card],[class*=stat],[class*=tile]") && el.querySelector("p, li");
    const full = (el.innerText || "").trim(); if (!full || seen.has(full)) continue;
    if (leafy) continue; seen.add(full);
    const card = el.closest("[class*=card],[class*=Card],[class*=stat],[class*=tile],[data-claim],article,section") || el;
    const scope = [el, card];
    const links = [...new Set(scope.flatMap((s) => [...s.querySelectorAll("a[href]")].map((a) => a.href)))];
    const cites = scope.flatMap((s) => [...s.querySelectorAll("cite, [cite]")].map((c) => c.getAttribute("cite") || c.textContent.trim()));
    const footnotes = scope.flatMap((s) => [...s.querySelectorAll('sup a[href^="#"], a[href^="#fn"], a[href^="#ref"], a[role=doc-noteref], [data-footnote-ref]')].map((a) => a.getAttribute("href")));
    const attrs = {}; let p = el;
    while (p && p !== document.body) { for (const k of ["data-source", "data-as-of", "data-recheck-by", "data-tier", "data-source-hash", "data-source-quote"]) if (!attrs[k] && p.getAttribute?.(k)) attrs[k] = p.getAttribute(k); p = p.parentElement; }
    for (const s of el.querySelectorAll("[data-source]")) if (!attrs["data-source"]) attrs["data-source"] = s.getAttribute("data-source");
    const ownLinkTexts = [...el.querySelectorAll("a[href],button,[role=button]")].filter((a) => a.tagName !== "A" ? /buy|get|unlock|checkout|purchase|order|subscribe|\$/i.test(a.innerText) && (a.closest("form")?.action ? own(a.closest("form").action) : true) : own(a.href)).map((a) => a.innerText.trim()).filter(Boolean);
    const insideOwn = (el.matches("a[href],button") || el.closest("a[href],button")) && (() => { const a = el.closest("a[href],button"); return a.tagName !== "A" || own(a.href); })();
    // Explicit own-price marker: ONLY currency amounts inside [data-own-price] (the element, an ancestor, or a
    // descendant) are exempt; any other number inside the marker is still a claim. No class-name guessing.
    const markedTexts = el.closest("[data-own-price]") ? [full] : [...el.querySelectorAll("[data-own-price]")].map((m) => m.innerText || "");
    const markedAmounts = markedTexts.flatMap((t) => t.match(CURRENCY) || []).map((x) => x.trim()); // one entry per marked occurrence
    const estMarkers = el.closest("[data-estimate]") ? [el.closest("[data-estimate]")] : [...el.querySelectorAll("[data-estimate]")];
    const estimateTexts = estMarkers.filter(estimateOk).map((m) => (m.innerText || "").trim()).filter(Boolean);
    // Long text is chunked (never dropped): every chunk keeps the element's citation evidence.
    for (const text of chunk(full)) {
      const ownPriceTexts = ownPage ? [text] : ownLinkTexts.slice();
      if (insideOwn) ownPriceTexts.push(text);
      const ownPriceAmounts = markedAmounts.filter((x) => text.includes(x));
      out.push({ text, links, cites, footnotes, attrs, ownPriceTexts, ownPriceAmounts, estimateTexts: estimateTexts.filter((x) => text.includes(x) || x.includes(text)), page: location.href, pagePath: location.pathname, host });
    }
  }
  return out;
}
if (typeof module !== "undefined") module.exports = { extractBlocks };
