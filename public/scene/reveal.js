// reveal.js -- the word reveal. The product's visual signature.
//
// From the design bible, and this is the sentence the whole moment hangs on:
//
//   "The word IS the light source, not a lit object. It acts as a masked
//    additive light layer casting rim-light onto the 2D assets behind it --
//    Butterbean's coat picks up a faint gold edge the moment the word appears.
//    The reward illuminates the world. This decision defines the product's
//    visual signature."
//
// So this is not a text animation with a glow filter. The order of operations
// is: the word arrives -> the world gets brighter because of it. If the light
// were merely decorative the child would learn "saying the word makes a pretty
// caption". What they should learn is "saying the word changed the world".
//
// Sequence (bible section on the reward moment):
//   T=0     aura flashes Bloom Flash at the point of need
//   T=100   the object arrives and snaps into place
//   T=300   the companion crosses / is freed
//   T=600   the word coalesces out of the dust motes, 90% -> 100%,
//           emitting Bloom Gold and rim-lighting everything behind it
//   T=3500  letters dissolve back into motes and drift up
//
// REDUCED MOTION: no spring, no scale -- the letters crossfade over 600ms.
// The light cast onto the world still fires and the sound design is identical,
// because the sound-to-symbol bond IS the product and must survive motion
// being switched off.

import { BLOOM_FLASH, BLOOM_GOLD } from './palette.js';

export const REVEAL_HOLD_MS = 3500;

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** SVG defs the reveal needs. Injected once per stage.
 *
 *  The feathered shadow is specified precisely in the bible: "a localised
 *  feathered multiply shadow hugging the letterforms at 45% core density,
 *  falling to zero at the edge. Not a scrim, not a plate -- a shadow the
 *  letters cast into the painting, which also anchors them in the scene's
 *  space." A rectangle behind the text would be the easy version and would
 *  read as UI sitting on top of a picture, which is exactly what this product
 *  must never look like. */
export function revealDefs() {
  return `
  <filter id="sc-word-shadow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="s"/>
    <feComponentTransfer in="s" result="soft">
      <feFuncA type="linear" slope="0.45"/>
    </feComponentTransfer>
    <feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>

  <filter id="sc-word-emit" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="halo"/>
    <feFlood flood-color="${BLOOM_GOLD}" result="gold"/>
    <feComposite in="gold" in2="halo" operator="in" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>

  <radialGradient id="sc-aura">
    <stop offset="0%"   stop-color="${BLOOM_FLASH}" stop-opacity="0.95"/>
    <stop offset="55%"  stop-color="${BLOOM_GOLD}"  stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${BLOOM_GOLD}"  stop-opacity="0"/>
  </radialGradient>`;
}

/** The additive light layer. Sits ABOVE the painted layers and below nothing
 *  -- it is what makes the word illuminate the world rather than float over
 *  it. Screen blend so it adds light instead of painting over the art, which
 *  is what keeps gouache texture visible through the glow. */
export function revealLayerMarkup() {
  return `
  <g class="sc-reveal" aria-hidden="true">
    <circle class="sc-aura" cx="600" cy="300" r="0" fill="url(#sc-aura)" opacity="0"/>
    <g class="sc-motes"></g>
    <g class="sc-word-wrap" opacity="0">
      <text class="sc-word" x="600" y="300" text-anchor="middle" dominant-baseline="middle"
            filter="url(#sc-word-shadow)" fill="#FFF7E6"
            style="font-family:Andika,-apple-system,BlinkMacSystemFont,'SF Pro Rounded',sans-serif;
                   font-size:132px;font-weight:700;letter-spacing:.01em"></text>
    </g>
  </g>`;
}

function motes(n, cx, cy, rng = Math.random) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = 90 + rng() * 230;
    out += `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d * 0.6).toFixed(1)}"
             r="${(1.2 + rng() * 2.6).toFixed(1)}" fill="${BLOOM_FLASH}" opacity="0"/>`;
  }
  return out;
}

/**
 * Play the reveal.
 *
 * @param {SVGElement} svg        the stage svg
 * @param {string}     word       the word the child said
 * @param {object}     opts
 * @param {(lit:number)=>void} opts.onLight  called with 0..1 so the CALLER can
 *        rim-light the actor. The reveal does not reach into the actor itself
 *        -- that would break the Actor Contract, since this file would then
 *        need to know what a coat is.
 * @returns {Promise<void>} resolves when the word has dissolved
 */
export async function playReveal(svg, word, { onLight = null, holdMs = REVEAL_HOLD_MS } = {}) {
  const aura = svg.querySelector('.sc-aura');
  const wrap = svg.querySelector('.sc-word-wrap');
  const text = svg.querySelector('.sc-word');
  const moteG = svg.querySelector('.sc-motes');
  if (!aura || !wrap || !text) return;

  const soft = reduceMotion();
  text.textContent = word;
  moteG.innerHTML = motes(soft ? 0 : 26, 600, 300);
  const moteEls = [...moteG.querySelectorAll('circle')];

  const light = (v) => { onLight?.(v); };

  // T=0 -- the aura flashes at the point of need.
  aura.setAttribute('r', '0');
  aura.style.transition = soft ? 'opacity 280ms linear' : 'r 420ms cubic-bezier(.2,.9,.3,1), opacity 420ms ease-out';
  aura.style.opacity = '1';
  aura.setAttribute('r', '250');
  light(0.35);
  await wait(soft ? 120 : 300);

  // T=600 -- the word coalesces out of the motes and starts emitting.
  if (!soft) {
    moteEls.forEach((m, i) => {
      m.style.transition = `opacity 220ms ease-out ${i * 7}ms, transform 620ms cubic-bezier(.3,.7,.2,1) ${i * 7}ms`;
      m.style.opacity = '0.9';
      m.style.transform = 'translate(0px, -14px)';
    });
  }
  wrap.style.transformOrigin = '600px 300px';
  wrap.style.transform = soft ? 'none' : 'scale(0.9)';
  wrap.style.transition = soft
    ? 'opacity 600ms linear'
    : 'opacity 420ms ease-out, transform 620ms cubic-bezier(.175,.885,.32,1.275)';
  // Emission is applied only once the word is actually present, so the world
  // brightens BECAUSE of the word rather than in anticipation of it.
  text.setAttribute('filter', 'url(#sc-word-emit)');
  wrap.style.opacity = '1';
  wrap.style.transform = 'scale(1)';
  light(1);

  await wait(holdMs);

  // Letters dissolve into motes and drift up.
  wrap.style.transition = 'opacity 520ms ease-in, transform 900ms ease-in';
  wrap.style.opacity = '0';
  if (!soft) wrap.style.transform = 'translateY(-26px) scale(1.02)';
  aura.style.transition = 'opacity 520ms ease-in';
  aura.style.opacity = '0';
  moteEls.forEach((m, i) => {
    m.style.transition = `opacity 420ms ease-in ${i * 5}ms, transform 900ms ease-in ${i * 5}ms`;
    m.style.opacity = '0';
    m.style.transform = 'translate(0px, -52px)';
  });
  light(0);
  await wait(560);
  moteG.innerHTML = '';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
