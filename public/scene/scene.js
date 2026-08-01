// scene.js -- renders a scene and poses whatever actor it is handed.
//
// THIS FILE MUST NEVER NAME A SPECIFIC ACTOR. No 'dog', no 'cat', no
// 'Butterbean'. It receives an actor object satisfying the contract in
// actors.js and poses it by anchor id. test-scene.mjs greps this file for
// actor names and fails if one appears -- if the scene knows what animal it
// is rendering, the contract has already leaked and swapping bodies will
// require touching scene code, which is the thing the contract exists to
// prevent.
//
// It also never names a phoneme. A scene knows it has a GAP; it does not know
// that /r/ is being practised (spec section 3).

import { MOUTHS, REQUIRED_ANCHORS } from './actors.js';

/** Backdrops per affordance. Deliberately simple flat shapes: this is a rig to
 *  prove the contract and the interaction, not final art. The illustrator's
 *  gouache drops into these same slots. */
const BACKDROPS = {
  GAP: {
    sky: ['#8FD3E8', '#D9F0FA'], ground: '#7FBF6A',
    art: `<path d="M0 300 L300 300 L300 420 L0 420 z" fill="#7FBF6A"/>
          <path d="M300 300 L300 420 L520 420 L520 300 z" fill="#6BA85A" opacity=".0"/>
          <path d="M520 300 L820 300 L820 420 L520 420 z" fill="#7FBF6A"/>
          <path d="M300 300 q110 40 220 0 L520 420 L300 420 z" fill="#4A6FA5" opacity=".35"/>`,
    label: 'the broken bridge',
  },
  REACH: {
    sky: ['#9BDCEF', '#E2F5FC'], ground: '#7FBF6A',
    art: `<path d="M0 320 L820 320 L820 420 L0 420 z" fill="#7FBF6A"/>
          <rect x="600" y="150" width="26" height="180" rx="12" fill="#8A6242"/>
          <circle cx="613" cy="128" r="76" fill="#5FAE55"/>
          <circle cx="560" cy="150" r="46" fill="#6DBE60"/>
          <circle cx="668" cy="152" r="42" fill="#6DBE60"/>`,
    label: 'the tall tree',
  },
  DARK: {
    sky: ['#3C5A8A', '#7C8FC9'], ground: '#4C6B44',
    art: `<path d="M0 320 L820 320 L820 420 L0 420 z" fill="#4C6B44"/>
          <path d="M470 320 q0 -130 130 -130 q130 0 130 130 z" fill="#2B3A2B"/>
          <ellipse cx="600" cy="320" rx="96" ry="20" fill="#1E2A1E"/>`,
    label: 'the dark hollow',
  },
  HIDDEN: {
    sky: ['#8FD3E8', '#DCF1F8'], ground: '#7FBF6A',
    art: `<path d="M0 330 L820 330 L820 420 L0 420 z" fill="#7FBF6A"/>
          <path d="M430 330 q120 -120 250 -10 z" fill="#6BAF5C"/>
          <path d="M430 330 q120 -120 250 -10" fill="none" stroke="#5C9C4F" stroke-width="4"/>`,
    label: 'the little hill',
  },
  CLOSED: {
    sky: ['#8FD3E8', '#DCF1F8'], ground: '#7FBF6A',
    art: `<path d="M0 320 L820 320 L820 420 L0 420 z" fill="#7FBF6A"/>
          <rect x="520" y="120" width="180" height="200" rx="10" fill="#9A6B45"/>
          <rect x="540" y="140" width="140" height="160" rx="6" fill="#B07C52"/>`,
    label: 'the door',
  },
  CARRY: {
    sky: ['#8FD3E8', '#DCF1F8'], ground: '#7FBF6A',
    art: `<path d="M0 320 L820 320 L820 420 L0 420 z" fill="#7FBF6A"/>
          <path d="M540 320 q10 -90 90 -90 q80 0 90 90 z" fill="#9AA3A8"/>
          <path d="M566 320 q8 -62 64 -62" fill="none" stroke="#B7BEC2" stroke-width="7"/>`,
    label: 'the heavy stone',
  },
};

const BOB = {
  still:  'none',
  gentle: 'sc-bob 3.4s ease-in-out infinite',
  wobble: 'sc-wobble 0.9s ease-in-out infinite',
  bounce: 'sc-bounce 0.7s cubic-bezier(.2,.9,.3,1.3) infinite',
};

export class Scene {
  /**
   * @param {HTMLElement} root         the stage (art + caption overlay)
   * @param {object}      actor        any object satisfying the Actor Contract
   * @param {HTMLElement} choicesRoot  where the child's choices are rendered.
   *
   * Choices render OUTSIDE the stage on purpose. When they lived inside it the
   * caption -- an absolutely-positioned overlay pinned to the stage's bottom
   * edge -- sat on top of them and swallowed every tap. A headless click test
   * caught it; a child would have experienced it as a game that ignores them,
   * which is the single worst failure this product can have. Keeping the
   * tappable layer out of the art layer makes that structurally impossible
   * rather than a z-index someone has to remember.
   */
  constructor(root, actor, choicesRoot = null) {
    this.root = root;
    this.choicesRoot = choicesRoot;
    this.setActor(actor);
  }

  /** Swapping the actor is a one-liner and touches nothing else in this file.
   *  That is the contract working. */
  setActor(actor) {
    const missing = REQUIRED_ANCHORS.filter((a) => !actor.svg.includes(`id="a-${a}"`));
    if (missing.length) {
      // Fail loudly at swap time rather than silently posing nothing.
      throw new Error(`actor "${actor.id}" is missing required anchors: ${missing.join(', ')}`);
    }
    this.actor = actor;
    if (this.root.querySelector('.sc-actor')) this._mountActor();
  }

  render({ affordance, state = 'WAIT', objects = [], onPick = null, caption = '' }) {
    const bd = BACKDROPS[affordance] || BACKDROPS.GAP;
    this.root.innerHTML = `
      <svg class="sc-svg" viewBox="0 0 820 420" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${bd.sky[0]}"/><stop offset="1" stop-color="${bd.sky[1]}"/>
          </linearGradient>
        </defs>
        <rect width="820" height="420" fill="url(#sc-sky)"/>
        ${bd.art}
        <g class="sc-objects"></g>
        <g class="sc-actor" transform="translate(120 150) scale(0.86)"></g>
      </svg>
      <div class="sc-caption">${caption}</div>`;

    this._mountActor();
    this.pose(state);
    this._mountObjects(objects, onPick);
    return this;
  }

  _mountActor() {
    const g = this.root.querySelector('.sc-actor');
    if (g) g.innerHTML = this.actor.svg;
  }

  /** Pose by anchor id. The scene has no idea what body plan it is posing. */
  pose(state) {
    const p = this.actor.poses[state] || this.actor.poses.WAIT;
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

  /** The things the child can go and do. THIS is the child-driven part: the
   *  world lays out several possibilities and then waits, indefinitely and
   *  warmly. Nothing advances until the child touches something. */
  _mountObjects(objects, onPick) {
    const wrap = this.choicesRoot;
    if (!wrap) return;
    if (!objects.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = objects
      .map((o, i) => `<button class="sc-obj" data-i="${i}" aria-label="${o.label}">
          <span class="sc-obj-art">${o.icon || '✦'}</span>
          <span class="sc-obj-label">${o.label}</span>
        </button>`)
      .join('');
    wrap.querySelectorAll('.sc-obj').forEach((b) => {
      b.addEventListener('click', () => onPick?.(Number(b.dataset.i)));
    });
  }

  say(text) {
    const c = this.root.querySelector('.sc-caption');
    if (c) c.textContent = text;
    return this;
  }

  clearChoices() {
    if (this.choicesRoot) this.choicesRoot.innerHTML = '';
    return this;
  }
}

/** Simple emoji stand-ins so the choices read as objects rather than words to
 *  a pre-reader. Real art replaces this map; nothing else changes. */
export const OBJECT_ICONS = {
  rope: '🪢', rock: '🪨', log: '🪵', board: '🪵', stone: '🪨', boat: '⛵', net: '🕸️',
  door: '🚪', mat: '🧶', path: '🛤️', wood: '🪵', bridge: '🌉', plank: '🪵', stick: '🪵',
  ball: '⚽', basket: '🧺', ribbon: '🎀', ladder: '🪜', kite: '🪁', hat: '🎩', pole: '🎣',
  bell: '🔔', nest: '🪹', moth: '🦋', apple: '🍏',
  lamp: '🪔', light: '💡', moon: '🌙', match: '🔥', sun: '☀️', candle: '🕯️', torch: '🔦',
  window: '🪟', fire: '🔥', lantern: '🏮', shine: '✨', star: '⭐', glow: '✨',
  bunny: '🐰', bird: '🐦', mouse: '🐭', duck: '🦆', frog: '🐸', fox: '🦊', deer: '🦌',
  hill: '⛰️', bug: '🐛', cat: '🐈', dog: '🐕', goose: '🪿', sheep: '🐑', fish: '🐟',
  chick: '🐤', whistle: '📣',
  key: '🗝️', knob: '🎛️', handle: '🚪', button: '🔘', hook: '🪝', ring: '💍', latch: '🔒',
  chain: '⛓️', gate: '🚧', lock: '🔒', magnet: '🧲', push: '👐',
  wagon: '🛒', cart: '🛒', wheel: '🛞', sled: '🛷', bag: '👜', box: '📦', tray: '🍽️',
  pillow: '🛏️', melon: '🍈', puppy: '🐶', lemon: '🍋',
};
export const iconFor = (word) => OBJECT_ICONS[word] || '✦';
