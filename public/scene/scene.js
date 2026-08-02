// scene.js -- renders a scene and poses whatever actor it is handed.
//
// THIS FILE MUST NEVER NAME A SPECIFIC ACTOR. No 'dog', no 'cat', no
// 'Butterbean'. It receives an actor satisfying the contract in actors.js and
// poses it by anchor id. test-scene.mjs greps this file and fails if an actor
// name appears -- a contract that holds by convention leaks the first time
// someone adds a wagging-tail special case, and by then the scenes are
// painted. It also never names a phoneme: a scene knows it has a GAP, not that
// /r/ is being practiced.
//
// TWO WAYS TO RENDER, one code path:
//   * real commissioned artwork -- layered WebP (background/midground/
//     foreground) resolved by assets.js;
//   * the painterly SVG fallback below, for any layer not yet delivered.
// Scenes can therefore go live one layer at a time, and the product is never
// broken by art that hasn't arrived.
//
// Both are lit by the SAME low-angle warm key (palette.KEY_LIGHT) and carry
// the same paper grain, so swapping a fallback for real art changes the
// drawing without changing the time of day.

import { MOUTHS, REQUIRED_ANCHORS, WAKE_STYLE, ASLEEP } from './actors.js';
import { ENV, KEY_LIGHT, BLOOM_GOLD, SUNSTONE, TWILIGHT } from './palette.js';
import { LAYERS, PARALLAX, resolveSceneArt } from './assets.js';
import { objectSvg } from './objects.js';
import { revealDefs, revealLayerMarkup, playReveal } from './reveal.js';

const TWILIGHT_HI = ENV.duskHi, TWILIGHT_LO = TWILIGHT;

const W = 1200, H = 600;

/** Painterly fallback backdrops.
 *
 *  Deliberately soft and layered rather than flat: the bible is explicit that
 *  the style is "Jon Klassen meets Sydney Smith... no vector-flat shading".
 *  These will not pass for gouache -- nothing hand-authored in SVG will -- but
 *  they establish the composition, the depth order and the key light that the
 *  real art inherits, so the commissioned pieces drop into a world that
 *  already behaves correctly. */
const FALLBACK = {
  GAP: {
    sky: [ENV.skyHi, ENV.skyLo],
    background: `<path d="M0 300 q160 -92 330 -18 q150 66 300 -14 q180 -96 570 26 L1200 380 L0 380 z" fill="${ENV.hillFar}" opacity=".75"/>
                 <path d="M0 340 q220 -70 430 -6 q210 62 420 -22 q170 -66 350 12 L1200 420 L0 420 z" fill="${ENV.hillNear}" opacity=".8"/>`,
    midground: `<path d="M0 470 L1200 470 L1200 600 L0 600 z" fill="${ENV.water}"/>
                <path d="M0 470 q300 26 600 0 q300 -26 600 0 L1200 505 L0 505 z" fill="${ENV.waterDeep}" opacity=".45"/>`,
    foreground: `<path d="M0 430 L470 430 L470 600 L0 600 z" fill="${ENV.grass}"/>
                 <path d="M730 430 L1200 430 L1200 600 L730 600 z" fill="${ENV.grass}"/>
                 <path d="M0 430 L470 430 L470 452 L0 452 z" fill="${ENV.grassDeep}" opacity=".5"/>
                 <path d="M730 430 L1200 430 L1200 452 L730 452 z" fill="${ENV.grassDeep}" opacity=".5"/>
                 <rect x="380" y="424" width="120" height="17" rx="5" fill="${ENV.wood}"/>
                 <rect x="700" y="424" width="120" height="17" rx="5" fill="${ENV.wood}"/>
                 <rect x="380" y="437" width="120" height="7" rx="3" fill="${ENV.woodDeep}" opacity=".6"/>
                 <rect x="700" y="437" width="120" height="7" rx="3" fill="${ENV.woodDeep}" opacity=".6"/>`,
  },
  REACH: {
    sky: [ENV.skyHi, ENV.skyLo],
    background: `<path d="M0 330 q240 -80 480 -12 q240 68 480 -18 q120 -40 240 8 L1200 400 L0 400 z" fill="${ENV.hillFar}" opacity=".7"/>`,
    midground: `<rect x="880" y="210" width="34" height="250" rx="15" fill="${ENV.woodDeep}"/>
                <circle cx="897" cy="182" r="104" fill="${ENV.grassDeep}" opacity=".9"/>
                <circle cx="812" cy="214" r="64" fill="${ENV.grass}" opacity=".92"/>
                <circle cx="982" cy="216" r="58" fill="${ENV.grass}" opacity=".92"/>`,
    foreground: `<path d="M0 452 L1200 452 L1200 600 L0 600 z" fill="${ENV.grass}"/>
                 <path d="M0 452 L1200 452 L1200 474 L0 474 z" fill="${ENV.grassDeep}" opacity=".45"/>`,
  },
  DARK: {
    sky: [ENV.duskHi, ENV.duskLo],
    background: `<path d="M0 320 q260 -70 520 -6 q250 62 500 -16 L1200 400 L0 400 z" fill="#4A5C74" opacity=".8"/>`,
    midground: `<path d="M660 470 q0 -186 190 -186 q190 0 190 186 z" fill="#2E3D34"/>
                <ellipse cx="850" cy="470" rx="140" ry="26" fill="#222E27"/>`,
    foreground: `<path d="M0 462 L1200 462 L1200 600 L0 600 z" fill="#4C6B44"/>
                 <path d="M0 462 L1200 462 L1200 482 L0 482 z" fill="#3C5637" opacity=".5"/>`,
  },
  HIDDEN: {
    sky: [ENV.skyHi, ENV.skyLo],
    background: `<path d="M0 330 q240 -78 480 -10 q240 66 480 -16 L1200 400 L0 400 z" fill="${ENV.hillFar}" opacity=".7"/>`,
    midground: `<path d="M620 470 q170 -168 350 -14 z" fill="${ENV.hillNear}"/>`,
    foreground: `<path d="M0 462 L1200 462 L1200 600 L0 600 z" fill="${ENV.grass}"/>
                 <path d="M620 470 q170 -168 350 -14" fill="none" stroke="${ENV.grassDeep}" stroke-width="5" opacity=".55"/>`,
  },
  CLOSED: {
    sky: [ENV.skyHi, ENV.skyLo],
    background: `<path d="M0 340 q260 -70 520 -8 q250 60 500 -14 L1200 410 L0 410 z" fill="${ENV.hillFar}" opacity=".65"/>`,
    midground: `<rect x="760" y="178" width="250" height="292" rx="14" fill="${ENV.woodDeep}"/>
                <rect x="784" y="202" width="202" height="244" rx="9" fill="${ENV.wood}"/>
                <rect x="784" y="300" width="202" height="9" fill="${ENV.woodDeep}" opacity=".45"/>`,
    foreground: `<path d="M0 462 L1200 462 L1200 600 L0 600 z" fill="${ENV.grass}"/>`,
  },
  CARRY: {
    sky: [ENV.skyHi, ENV.skyLo],
    background: `<path d="M0 336 q250 -74 500 -8 q245 62 490 -16 L1200 404 L0 404 z" fill="${ENV.hillFar}" opacity=".68"/>`,
    midground: `<path d="M760 470 q14 -128 128 -128 q114 0 128 128 z" fill="#9AA3A8"/>
                <path d="M797 470 q11 -88 91 -88" fill="none" stroke="#B7BEC2" stroke-width="9" opacity=".8"/>`,
    foreground: `<path d="M0 462 L1200 462 L1200 600 L0 600 z" fill="${ENV.grass}"/>`,
  },
};

const BOB = {
  still:  'none',
  gentle: 'sc-bob 3.4s ease-in-out infinite',
  wobble: 'sc-wobble 0.9s ease-in-out infinite',
  bounce: 'sc-bounce 0.7s cubic-bezier(.2,.9,.3,1.3) infinite',
};

/** Paper grain + edge pooling.
 *
 *  The bible asks for "visible gouache paper grain, watercolor edge-pooling"
 *  and explicitly rules out vector-flat. feTurbulence gives real grain, and a
 *  small displacement on the shapes softens the machine-perfect vector edges
 *  into something closer to a wet edge. Applied to the fallback art only --
 *  real gouache arrives with its grain already in the pixels, and running a
 *  filter over it would just soften someone's painting. */
function textureDefs() {
  return `
  <filter id="sc-paper" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="7" result="grain"/>
    <feColorMatrix in="grain" type="saturate" values="0" result="g"/>
    <feComponentTransfer in="g" result="soft"><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
    <feComposite in="soft" in2="SourceGraphic" operator="in" result="masked"/>
    <feBlend in="SourceGraphic" in2="masked" mode="multiply"/>
  </filter>

  <filter id="sc-pool" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>

  <linearGradient id="sc-key" x1="0" y1="0" x2="1" y2="0.35">
    <stop offset="0%"   stop-color="${KEY_LIGHT.warm}" stop-opacity=".42"/>
    <stop offset="45%"  stop-color="${KEY_LIGHT.warm}" stop-opacity=".12"/>
    <stop offset="100%" stop-color="${KEY_LIGHT.warm}" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="sc-dusk" x1="0" y1="0" x2="0.25" y2="1">
    <stop offset="0%"   stop-color="${TWILIGHT_HI}"/>
    <stop offset="100%" stop-color="${TWILIGHT_LO}"/>
  </linearGradient>

  <radialGradient id="sc-vignette" cx="50%" cy="46%" r="72%">
    <stop offset="60%"  stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#3A2E22" stop-opacity=".26"/>
  </radialGradient>`;
}

export class Scene {
  /**
   * @param {HTMLElement} root         the stage (art + caption overlay)
   * @param {object}      actor        any object satisfying the Actor Contract
   * @param {HTMLElement} choicesRoot  where the child's choices render.
   *
   * Choices render OUTSIDE the stage on purpose. When they lived inside it the
   * caption -- an absolutely-positioned overlay pinned to the stage's bottom
   * edge -- sat on top of them and swallowed every tap. A headless click test
   * caught it; a child would have experienced it as a game that ignores them,
   * which is close to the worst failure this product can have. Keeping the
   * tappable layer out of the art layer makes that structurally impossible
   * rather than a z-index someone has to remember.
   */
  constructor(root, actor, choicesRoot = null) {
    this.root = root;
    this.choicesRoot = choicesRoot;
    this.artCache = new Map();
    this.setActor(actor);
  }

  /** Swapping the actor is a one-liner and touches nothing else in this file.
   *  That is the contract working. */
  setActor(actor) {
    const missing = REQUIRED_ANCHORS.filter((a) => !actor.svg.includes(`id="a-${a}"`));
    if (missing.length) {
      throw new Error(`actor "${actor.id}" is missing required anchors: ${missing.join(', ')}`);
    }
    this.actor = actor;
    if (this.root.querySelector('.sc-actor')) this._mountActor();
  }

  /** Resolve (and cache) which painted layers exist for a scene. */
  async loadArt(affordance, opts = {}) {
    if (this.artCache.has(affordance)) return this.artCache.get(affordance);
    const resolved = await resolveSceneArt(affordance, opts);
    this.artCache.set(affordance, resolved);
    return resolved;
  }

  render({ affordance, state = 'WAIT', objects = [], onPick = null, caption = '',
           art = null, voice = null }) {
    const fb = FALLBACK[affordance] || FALLBACK.GAP;
    const painted = art && art.hasArt ? art.layers : {};

    // One code path, whichever exists. A painted layer becomes an <image>; an
    // unpainted one falls back to SVG shapes carrying the same grain.
    const layer = (name) => {
      const url = painted[name];
      const px = PARALLAX[name] ?? 1;
      if (url) {
        return `<g class="sc-layer" data-layer="${name}" data-parallax="${px}">
                  <image href="${url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
                </g>`;
      }
      return `<g class="sc-layer" data-layer="${name}" data-parallax="${px}" filter="url(#sc-paper)">
                <g filter="url(#sc-pool)">${fb[name] || ''}</g>
              </g>`;
    };

    this.root.innerHTML = `
      <svg class="sc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img"
           aria-label="${(art && art.alt) || fb.label || 'scene'}">
        <defs>
          <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${fb.sky[0]}"/><stop offset="1" stop-color="${fb.sky[1]}"/>
          </linearGradient>
          ${textureDefs()}
          ${revealDefs()}
        </defs>

        ${painted.background ? '' : `<rect width="${W}" height="${H}" fill="url(#sc-sky)"/>`}
        ${layer('background')}
        ${layer('midground')}
        ${layer('foreground')}

        <g class="sc-actor" transform="translate(250 250) scale(1.15)"></g>

        <!-- one consistent low-angle warm key across every scene, so fallback
             and commissioned art are lit identically -->
        <rect class="sc-keylight" width="${W}" height="${H}" fill="url(#sc-key)"
              style="mix-blend-mode:screen" pointer-events="none"/>
        <rect class="sc-dusk" width="${W}" height="${H}" fill="url(#sc-dusk)"
              opacity="0" pointer-events="none" style="mix-blend-mode:multiply"/>
        <rect width="${W}" height="${H}" fill="url(#sc-vignette)" pointer-events="none"/>

        ${revealLayerMarkup()}
      </svg>
      <div class="sc-caption">${caption}</div>`;

    // render() paints the caption itself rather than going through say(), so
    // it has to speak it too. A caption that reaches the screen without
    // reaching the speaker does not exist for a child who cannot read.
    if (caption) {
      this.spoken = this.voiceHook
        ? Promise.resolve(this.voiceHook(voice || [{ text: caption }])).catch(() => false)
        : Promise.resolve(false);
    }

    this._mountActor();
    this.pose(state);
    this._mountObjects(objects, onPick);
    this.affordance = affordance;
    return this;
  }

  _mountActor() {
    const g = this.root.querySelector('.sc-actor');
    if (g) g.innerHTML = this.actor.svg;
  }

  /** Pose by anchor id. The scene has no idea what body plan it is posing. */
  pose(state) {
    const p = this.actor.poses[state] || this.actor.poses.WAIT;
    if (state === ASLEEP) this.setAsleep(true);
    else if (this.asleep) this.setAsleep(false);
    const q = (id) => this.root.querySelector(`#a-${id}`);
    const bob = this.root.querySelector('#a-bob');
    if (bob) bob.style.animation = BOB[p.bob] || BOB.gentle;
    const tail = q('tail');
    if (tail) tail.setAttribute('d', p.tail);
    const head = q('head');
    if (head) head.setAttribute('transform', p.head);
    const mouth = q('mouth');
    if (mouth) mouth.setAttribute('d', MOUTHS[p.mouth] || MOUTHS.smile);
    this.state = state;
    return this;
  }

  /** Put the actor to sleep, or wake it.
   *
   *  Only the toy participates (`actor.wakes`), and this is the whole reason
   *  it exists: for the toy the first word does not solve a problem, it brings
   *  something to life. Colour floods back over WAKE_STYLE.transitionMs rather
   *  than snapping, because the flooding IS the reward -- a child needs to see
   *  it happen, and to see that they caused it.
   *
   *  Implemented as a filter on the actor root plus closed eyelids, so no
   *  actor needs a second set of artwork and nothing about the scene changes.
   */
  setAsleep(asleep) {
    const root = this.root.querySelector('#a-root');
    if (!root || !this.actor.wakes) return this;
    root.style.transition = `filter ${WAKE_STYLE.transitionMs}ms ease-out`;
    root.style.filter = asleep ? WAKE_STYLE.asleep : WAKE_STYLE.awake;
    for (const id of ['eyeL', 'eyeR']) {
      const e = this.root.querySelector(`#a-${id}`);
      if (e) {
        e.style.transition = `opacity 320ms ease-out`;
        e.style.opacity = asleep ? '0' : '1';
      }
    }
    let lids = this.root.querySelector('.sc-lids');
    if (asleep && !lids) {
      const head = this.root.querySelector('#a-head');
      if (head) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'sc-lids');
        g.innerHTML = `<path d="M80 68 q9 7 18 0" stroke="#5C4A3A" stroke-width="3" fill="none" stroke-linecap="round"/>
                       <path d="M108 68 q9 7 18 0" stroke="#5C4A3A" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        head.appendChild(g);
      }
    } else if (!asleep && lids) {
      lids.remove();
    }
    this.asleep = asleep;
    return this;
  }

  /** Rim-light the actor.
   *
   *  Called by the reveal with 0..1. The reveal never reaches into the actor
   *  itself -- if it did, reveal.js would have to know what a coat is and the
   *  Actor Contract would leak. It hands the scene a number; the scene applies
   *  it to the anchor it already owns. */
  rimLight(v) {
    const root = this.root.querySelector('#a-root');
    if (!root) return;
    root.style.filter = v > 0
      ? `drop-shadow(0 0 ${(10 * v).toFixed(1)}px ${BLOOM_GOLD}) brightness(${(1 + 0.14 * v).toFixed(3)})`
      : '';
  }

  /** The word reveal -- the world brightens BECAUSE of the word. */
  async reveal(word) {
    const svg = this.root.querySelector('.sc-svg');
    if (!svg) return;
    await playReveal(svg, word, { onLight: (v) => this.rimLight(v) });
  }

  /** The things the child can go and do. THIS is the child-driven part: the
   *  world lays out several possibilities and then waits, indefinitely and
   *  warmly. Nothing advances until the child touches something. */
  _mountObjects(objects, onPick) {
    const wrap = this.choicesRoot;
    if (!wrap) return;
    if (!objects.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = objects
      .map((o, i) => `<button class="sc-obj" data-i="${i}" aria-label="${o.label}">
          <span class="sc-obj-art">${objectSvg(o.label)}</span>
          <span class="sc-obj-label">${o.label}</span>
        </button>`)
      .join('');
    wrap.querySelectorAll('.sc-obj').forEach((b) => {
      b.addEventListener('click', () => onPick?.(Number(b.dataset.i)));
    });
  }

  /** Parallax. Layers were already tagged with a strength; this is what makes
   *  them actually move, which is the only reason to have layers at all. */
  setCamera(x) {
    this.root.querySelectorAll('.sc-layer').forEach((g) => {
      const p = Number(g.dataset.parallax || 1);
      g.style.transform = `translateX(${(-x * p).toFixed(2)}px)`;
    });
    const actor = this.root.querySelector('.sc-actor');
    if (actor) actor.style.transform = `translate(${250 - x}px, 250px) scale(1.15)`;
    this.cameraX = x;
    return this;
  }

  /** Pan across the world to the next station, walking the companion there.
   *
   *  Spec section 6: the lesson never announces itself -- there is no level
   *  select, no menu, no "next lesson" card. The camera simply pans and the
   *  next thing happens. The walk is why the companion has a WAIT bob during
   *  it: standing frozen while the world slides past reads as a cutscene, and
   *  this is meant to feel like an afternoon, not a chapter break. */
  async panTo(nextAffordance, { art = null, durationMs = 1100 } = {}) {
    const svg = this.root.querySelector('.sc-svg');
    if (!svg) { return this; }
    const soft = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (soft) { this.render({ affordance: nextAffordance, state: 'WAIT', art }); return this; }

    this.root.querySelectorAll('.sc-layer').forEach((g) => {
      g.style.transition = `transform ${durationMs}ms cubic-bezier(.4,.0,.2,1)`;
    });
    const actor = this.root.querySelector('.sc-actor');
    if (actor) actor.style.transition = `transform ${durationMs}ms cubic-bezier(.4,.0,.2,1)`;
    this.pose('WAIT');
    this.setCamera(W * 0.55);
    await new Promise((r) => setTimeout(r, durationMs));
    this.render({ affordance: nextAffordance, state: 'WAIT', art });
    return this;
  }

  /** Time of day.
   *
   *  Spec section 6: the world runs west-to-east from golden hour into dusk,
   *  which gives a natural, guilt-free session end -- the light goes down and
   *  the companion settles, instead of a paywall or a "come back tomorrow"
   *  nag. A session ends because evening came, not because the app cut you off.
   *
   *  @param {number} t 0 = golden hour, 1 = dusk
   */
  setTimeOfDay(t) {
    const clamp = Math.max(0, Math.min(1, t));
    const dusk = this.root.querySelector('.sc-dusk');
    if (dusk) dusk.setAttribute('opacity', (clamp * 0.62).toFixed(3));
    const key = this.root.querySelector('.sc-keylight');
    if (key) key.setAttribute('opacity', (1 - clamp * 0.55).toFixed(3));
    this.timeOfDay = clamp;
    return this;
  }

  /**
   * Put a line in the caption -- and speak it, if a voice has been attached.
   *
   * The caption is the ONLY place this surface talks to a child, so routing
   * speech through here rather than through each call site is what guarantees
   * nothing is ever shown silently. A pre-reader cannot read the caption; if a
   * line reaches the caption without reaching the speaker, that line does not
   * exist for the child the product is for.
   *
   * @param {string} text   what the caption shows.
   * @param {Array<{id?:string,text:string}>} [voice]  how to SAY it, when that
   *   differs from how it reads -- typically a station phrase plus a word,
   *   played as two clips. Defaults to speaking the caption verbatim.
   *
   * Returns `this` so `pose(...).say(...)` still chains. To wait for the line
   * to finish, await `scene.spoken` -- never a fixed timer, which is precisely
   * what truncated speech in the garden games.
   */
  say(text, voice) {
    const c = this.root.querySelector('.sc-caption');
    if (c) c.textContent = text;
    this.spoken = this.voiceHook
      ? Promise.resolve(this.voiceHook(voice || [{ text }])).catch(() => false)
      : Promise.resolve(false);
    return this;
  }

  /** Attach a speaker. Without one the scene is captions-only, which is a
   *  complete way to play for a reader and an incomplete one for a child. */
  withVoice(hook) {
    this.voiceHook = hook;
    return this;
  }

  clearChoices() {
    if (this.choicesRoot) this.choicesRoot.innerHTML = '';
    return this;
  }
}

/** Kept as a re-export so callers have one import for scene concerns. The
 *  drawings themselves live in objects.js. */
export { objectSvg, hasObjectArt } from './objects.js';
