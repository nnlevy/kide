// Pip with a cast of their own. Same CSS-drawn sprout as everywhere on Kide
// (docs/BRAND.md: no image files), plus little feet and arms so the cast has
// somewhere to go. Shared by the public page's demo and the app.

import { COLORS, words } from "./content.js";

const MOUTHS = {
  happy: '<path d="M4,4 Q20,20 36,4" stroke="#2E3A3F" stroke-width="4" fill="none" stroke-linecap="round"/>',
  cheer: '<path d="M4,3 Q20,24 36,3 Z" fill="#2E3A3F"/>',
  calm: '<path d="M8,8 Q20,14 32,8" stroke="#2E3A3F" stroke-width="4" fill="none" stroke-linecap="round"/>',
};

/**
 * @param {object} o
 * @param {object} o.setup     kind / where / color / crutches
 * @param {string[]} [o.stickers] emoji to show on the cast (most recent last)
 * @param {"happy"|"cheer"|"calm"|"sleepy"} [o.mood]
 */
export function pipHTML({ setup = {}, stickers = [], mood = "happy" } = {}) {
  const w = words(setup);
  const color = (COLORS.find((c) => c.id === setup.color) || COLORS[0]).hex;
  const sleepy = mood === "sleepy";
  const castSide = w.where === "arm" ? "arm r" : "foot l";
  const shown = stickers.slice(-6);
  const spots = shown
    .map((e, i) => `<span class="pc-sticker s${i}">${e}</span>`)
    .join("");
  const castCls = `pc-cast pc-${w.kind} on-${w.where}`;
  const cast = w.kind === "sling"
    ? `<div class="pc-sling" style="--cast:${color}"></div><div class="${castCls}" style="--cast:${color}">${spots}</div>`
    : `<div class="${castCls}" style="--cast:${color}">${w.kind === "boot" ? '<i class="strap a"></i><i class="strap b"></i>' : ""}${spots}</div>`;
  const crutch = setup.crutches && w.where === "leg" ? '<div class="pc-crutch"><i></i></div>' : "";
  return `<div class="pip pc-pip${sleepy ? " is-sleepy" : ""}" data-mood="${mood}">
    ${crutch}
    <div class="pip-bob">
      <div class="pc-limb pc-arm l"></div><div class="pc-limb pc-arm r${castSide === "arm r" ? " hidden-under" : ""}"></div>
      <div class="pc-limb pc-foot l${castSide === "foot l" ? " hidden-under" : ""}"></div><div class="pc-limb pc-foot r"></div>
      <div class="pip-sprout"><div class="pip-stem"></div><div class="pip-leaf n1"></div><div class="pip-leaf n2"></div></div>
      <div class="pip-body">
        <div class="pip-cheek l"></div><div class="pip-cheek r"></div>
        <div class="pip-eye l"><div class="pip-pupil"></div></div>
        <div class="pip-eye r"><div class="pip-pupil"></div></div>
        <div class="pip-mouth"><svg viewBox="0 0 40 24" width="100%" height="100%" aria-hidden="true">${MOUTHS[mood] || MOUTHS.happy}</svg></div>
      </div>
      ${cast}
    </div>
    ${sleepy ? '<div class="pc-zzz" aria-hidden="true">z z z</div>' : ""}
  </div>`;
}

/** Render into an element, sizing sticker text from the element's width. */
export function mountPip(el, opts) {
  if (!el) return;
  el.innerHTML = pipHTML(opts);
  const size = el.getBoundingClientRect().width || 200;
  el.style.setProperty("--pc-font", `${Math.max(13, Math.round(size / 11))}px`);
}
