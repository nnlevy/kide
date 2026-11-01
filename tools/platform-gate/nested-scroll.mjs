/**
 * Nested vertical scroll check (phone profiles only). Lesson from 10-7.org (2026-10-22): a framed list with its own
 * scrollbar inside the page scroll (overflow-y auto/scroll + fixed/max height) wastes space and makes it unclear what
 * scrolls. Primary content must ride the ONE page scroll on phones.
 *
 * Flags an element when ALL hold: overflow-y auto|scroll; it actually scrolls (scrollHeight > clientHeight + 24);
 * it is at least 120px tall and 60% of the viewport wide; its height is bounded (max-height set, or a fixed height
 * that is not the viewport itself); it holds primary content (>= 280 chars of text, or headings/articles/3+ paragraphs).
 * Ignored: html/body, position fixed/sticky overlays (drawers, sheets), nav/header/footer/aside, dialogs, menus,
 * listboxes, textarea/select/iframe, code/pre, tables (wide data), and [data-scroll-ok] (explicit, reviewed opt-out).
 *
 * `nestedScroll` runs inside the page (page.evaluate) so it must stay self-contained.
 */
export function nestedScroll() {
  const vw = document.documentElement.clientWidth, vh = innerHeight, out = [];
  const skip = "nav,header,footer,aside,dialog,[role=dialog],[aria-modal=true],[role=menu],[role=listbox],[role=tooltip],pre,code,table,textarea,select,iframe,[data-scroll-ok]";
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    if (!/^(auto|scroll|overlay)$/.test(s.overflowY)) continue;
    if (el.closest(skip) || s.display === "none" || s.visibility === "hidden") continue;
    if (el.clientHeight < 120 || el.scrollHeight <= el.clientHeight + 24) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.6) continue;
    let fixedAncestor = false; for (let p = el; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === "fixed" || ps === "sticky") { fixedAncestor = true; break; } }
    if (fixedAncestor) continue;
    const bounded = s.maxHeight !== "none" || Math.abs(el.clientHeight - vh) > 2;
    if (!bounded) continue;
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    const primary = text.length >= 280 || el.querySelector("h1,h2,h3,article") || el.querySelectorAll("p").length >= 3;
    if (!primary) continue;
    if (out.some((o) => o.el.contains(el))) continue; // report the outermost only
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "";
    out.push({ el, d: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls} ${el.clientHeight}/${el.scrollHeight}px` });
  }
  return out.map((o) => o.d);
}

/** Phone profiles = every mobile-strict profile except tablets. */
export const isPhoneProfile = (id) => !/ipad|tablet/i.test(id);

/** Defect line in mobile-strict format; ratchet maps it to check "mobile:nested-scroll". */
export const nestedScrollDefect = (list) => (list && list.length ? `nested scroll: ${list.slice(0, 3).join(", ")}` : null);
