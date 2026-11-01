#!/usr/bin/env node
/**
 * Vendored from Keeper mobile-gate-deps/strict-gate.mjs (MOBILE-SPEC.md). Shared platform copy: change here, not per site.
 * Strict 15-profile mobile gate (MOBILE-SPEC.md). GET loads only, never submits.
 * Fails (exit 1 with --strict) on: HTTP >=400 / load failure, horizontal overflow, tap targets < 44px,
 * visible text < 12px, axe critical (WCAG 2 A/AA), CLS > 0.1, and (phone profiles) a nested vertical scroll container
 * holding primary content (nested-scroll.mjs). LCP/load are reported only.
 * Usage: node tools/platform-gate/mobile-strict.mjs http://127.0.0.1:8787/ [more URLs] --out mobile-results --strict [--devices a,b]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, webkit, devices } from "playwright";
import { sameSite } from "./same-site.mjs";
import { blockRum } from "./rum-block.mjs";
import { nestedScroll, isPhoneProfile, nestedScrollDefect } from "./nested-scroll.mjs";
let AxeBuilder = null; try { AxeBuilder = (await import("@axe-core/playwright")).default; } catch {}
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt("out", "mobile-results"); const MIN_TAP = 44;
const urls = argv.filter((a, i) => /^https?:\/\//.test(a) && !argv[i - 1]?.startsWith("--"));
const S8 = { ...devices["Galaxy S8"], viewport: { width: 360, height: 740 } };
const MATRIX = [
  ["iphone-se", webkit, devices["iPhone SE (3rd gen)"]], ["iphone-13-mini", webkit, devices["iPhone 13 Mini"]],
  ["iphone-15-pro-max", webkit, devices["iPhone 15 Pro Max"]], ["iphone-16-pro-max", webkit, devices["iPhone 16 Pro Max"]],
  ["galaxy-a55", chromium, devices["Galaxy A55"]], ["galaxy-s8", chromium, S8], ["pixel-7", chromium, devices["Pixel 7"]],
  ["android-320", chromium, { ...S8, viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 }], ["ipad-mini", webkit, devices["iPad Mini"]],
  ["iphone-se-landscape", webkit, devices["iPhone SE (3rd gen) landscape"]], ["iphone-se-text200", webkit, devices["iPhone SE (3rd gen)"], { text: 2 }],
  ["pixel-7-text200-dark", chromium, devices["Pixel 7"], { text: 2, colorScheme: "dark" }],
  ["iphone-13-mini-dark-reduced", webkit, devices["iPhone 13 Mini"], { colorScheme: "dark", reducedMotion: "reduce" }],
  ["galaxy-a-slow3g-cpu4x", chromium, S8, { slow: true }], ["iphone-se-chromium", chromium, devices["iPhone SE (3rd gen)"]],
].map(([id, engine, d, x = {}]) => ({ id, engine, d, ...x }));
const want = opt("devices") ? opt("devices").split(",") : MATRIX.map((m) => m.id);
const unknown = want.filter((w) => !MATRIX.some((m) => m.id === w));
if (unknown.length) { console.error(`unknown device(s): ${unknown.join(",")}`); process.exit(2); }
if (!urls.length) { console.error("give at least one URL"); process.exit(2); }
const OBS = `(() => { window.__cls = 0; window.__lcp = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {} })()`;
const TEXT = (s) => `(() => { const f = () => { const st = document.createElement('style'); st.textContent = 'html{font-size:${s * 100}% !important}'; (document.head||document.documentElement).appendChild(st); }; f(); })()`; // apply at document start (init), not DOMContentLoaded, so the gate's own late font jump is not scored as CLS
const inPage = (minTap) => {
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > -scrollY; };
  const d = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : ""} "${(el.getAttribute("aria-label") || el.innerText || el.getAttribute("href") || "").trim().replace(/\s+/g, " ").slice(0, 30)}"`;
  const overflow = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.right <= vw + 1) continue;
    let p = el.parentElement, sc = false; while (p && p !== document.body) { if (getComputedStyle(p).overflowX !== "visible") { sc = true; break; } p = p.parentElement; }
    if (!sc) overflow.push(`${d(el)} +${Math.round(r.right - vw)}px`);
  }
  const small = [];
  for (const el of document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary")) {
    if (!vis(el) || el.closest('[aria-hidden="true"]') || (el.textContent.trim() && !el.innerText.trim() && !el.querySelector("img,svg"))) continue; // innerText "" = not rendered (collapsed)
    if (el.closest(".sr-only,.visually-hidden,.skip-link,.skip-to-content") || (el.tagName === "A" && /^#/.test(el.getAttribute("href") || "") && /skip/i.test(el.innerText || el.className))) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && (el.parentElement.innerText || "").trim().length > (el.innerText || "").trim().length + 12) continue;
    let r = el.getBoundingClientRect(); if ((el.type === "checkbox" || el.type === "radio") && el.closest("label")) r = el.closest("label").getBoundingClientRect();
    if (r.width < minTap - 0.5 || r.height < minTap - 0.5) small.push(`${d(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const tiny = [...document.querySelectorAll("body *")].filter(vis).filter((e) => !e.closest(".sr-only,.visually-hidden,svg") && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => `${d(e)} ${getComputedStyle(e).fontSize}`);
  return { vw, scrollW: document.documentElement.scrollWidth, overflow: overflow.slice(0, 10), small: small.slice(0, 12), smallCount: small.length, tiny: tiny.slice(0, 8), tinyCount: tiny.length, cls: +(window.__cls || 0).toFixed(3), lcp: Math.round(window.__lcp || 0), h1: !!document.querySelector("h1, main, [role=main]") };
};
mkdirSync(OUT, { recursive: true }); const rows = [];
for (const m of MATRIX.filter((m) => want.includes(m.id))) {
  const browser = await m.engine.launch();
  for (const url of urls) {
    const { defaultBrowserType, ...d } = m.d;
    const ctx = await browser.newContext({ ...d, bypassCSP: /^http:\/\/(127\.0\.0\.1|localhost)/.test(url), colorScheme: m.colorScheme, reducedMotion: m.reducedMotion });
    await blockRum(ctx, m.id); await ctx.addInitScript(OBS); if (m.text) await ctx.addInitScript(TEXT(m.text));
    const page = await ctx.newPage();
    if (m.slow) { const c = await ctx.newCDPSession(page); await c.send("Network.enable"); await c.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 51200, uploadThroughput: 51200 }); await c.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
    const row = { device: m.id, url, defects: [] };
    try {
      const resp = await page.goto(url, { waitUntil: "load", timeout: m.slow ? 120000 : 60000 }); row.status = resp?.status() || 0;
      await page.waitForTimeout(m.slow ? 5000 : 2500);
      Object.assign(row, await page.evaluate(inPage, MIN_TAP));
      if (isPhoneProfile(m.id)) row.nestedScroll = await page.evaluate(nestedScroll);
      if (AxeBuilder) { try { const a = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze(); row.axe = a.violations.filter((v) => v.impact === "critical").map((v) => `${v.id}(${v.nodes.length})`); } catch (e) { row.axe = [`axe-error ${String(e.message).slice(0, 60)}`]; } }
      await page.screenshot({ path: `${OUT}/${new URL(url).pathname.replace(/\W+/g, "_") || "home"}--${m.id}.png` });
      if (row.status >= 400) row.defects.push(`HTTP ${row.status}`);
      if (!sameSite(url, page.url())) row.defects.push(`redirected off-origin: ${page.url()}`);
      if (!row.h1) row.defects.push("journey: page has no h1/main");
      if (row.scrollW > row.vw + 1) row.defects.push(`overflow ${row.scrollW - row.vw}px: ${row.overflow.slice(0, 3).join(", ")}`);
      if (row.smallCount) row.defects.push(`${row.smallCount} taps<44: ${row.small.slice(0, 4).join(", ")}`);
      if (row.tinyCount) row.defects.push(`${row.tinyCount} text<12px: ${row.tiny.slice(0, 3).join(", ")}`);
      if (row.cls > 0.1) row.defects.push(`CLS ${row.cls}`);
      const ns = nestedScrollDefect(row.nestedScroll); if (ns) row.defects.push(ns);
      if (row.axe?.length) row.defects.push(`axe critical: ${row.axe.join(", ")}`);
    } catch (e) { row.defects.push(`load failed: ${e.message.split("\n")[0].slice(0, 100)}`); }
    rows.push(row); console.log(`${row.defects.length ? "FAIL" : "PASS"} ${m.id.padEnd(28)} ${url}  ${row.defects.join(" | ")}`);
    await ctx.close();
  }
  await browser.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.defects.length).length; console.log(`\n${rows.length - bad}/${rows.length} device-page runs pass`);
if (argv.includes("--strict") && bad) process.exit(1);
