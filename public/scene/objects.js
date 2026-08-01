// objects.js -- the things a child can choose, drawn.
//
// These replace an emoji map. Emoji were never shippable: they render as a
// different picture on every platform, carry someone else's colour, ignore the
// scene's key light entirely, and on some systems a two-year-old is shown a
// glyph box. An object the child is asked to name has to be unambiguous, so
// it has to be drawn.
//
// Everything is authored in the brand palette (palette.js) and lit from frame
// left at the same low angle as every scene, so a choice card and the world
// behind it agree about where the sun is.
//
// Drawn on a 64x64 grid, ground line at y=54.

import { SUNSTONE, BLOOM_GOLD, COAT, COAT_ALT, ENV } from './palette.js';

const INK = '#5C4A3A';
const SHADOW = 'rgba(74,58,44,0.18)';
const sh = (cx = 32, rx = 18) => `<ellipse cx="${cx}" cy="56" rx="${rx}" ry="3.4" fill="${SHADOW}"/>`;
const O = {};

// ---- crossing / spanning ---------------------------------------------------
O.rope = `${sh(32,17)}<path d="M12 44 q10 -22 20 -10 q10 12 20 -10" stroke="${ENV.wood}" stroke-width="7"
  fill="none" stroke-linecap="round"/><path d="M12 44 q10 -22 20 -10 q10 12 20 -10" stroke="${ENV.woodDeep}"
  stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="3 6" opacity=".55"/>`;
O.board = `${sh()}<rect x="8" y="30" width="48" height="14" rx="3" fill="${ENV.wood}"/>
  <rect x="8" y="38" width="48" height="6" rx="2" fill="${ENV.woodDeep}" opacity=".5"/>
  <path d="M14 32 h36 M14 35 h30" stroke="${ENV.woodDeep}" stroke-width="1" opacity=".4"/>`;
O.log = `${sh()}<rect x="7" y="28" width="50" height="20" rx="10" fill="${ENV.wood}"/>
  <ellipse cx="52" cy="38" rx="5" ry="10" fill="${ENV.woodDeep}"/>
  <ellipse cx="52" cy="38" rx="2.4" ry="5" fill="${ENV.wood}" opacity=".7"/>`;
O.plank = O.board; O.stick = `${sh(32,12)}<path d="M14 46 L48 22" stroke="${ENV.wood}" stroke-width="6" stroke-linecap="round"/>
  <path d="M36 32 l8 -9" stroke="${ENV.wood}" stroke-width="4" stroke-linecap="round"/>`;
O.stone = `${sh(32,16)}<path d="M13 46 q-3 -16 12 -20 q16 -5 24 8 q6 12 -4 14 z" fill="#A8AEB0"/>
  <path d="M18 40 q6 -10 18 -11" stroke="#C3C8C9" stroke-width="3" fill="none" opacity=".8"/>`;
O.rock = O.stone;
O.bridge = `${sh()}<path d="M6 44 q26 -22 52 0" stroke="${ENV.wood}" stroke-width="7" fill="none"/>
  <path d="M16 40 v8 M32 34 v14 M48 40 v8" stroke="${ENV.woodDeep}" stroke-width="4"/>`;
O.mat = `${sh()}<rect x="10" y="34" width="44" height="14" rx="3" fill="${SUNSTONE}" opacity=".85"/>
  <path d="M14 38 h36 M14 43 h36" stroke="#8A3F22" stroke-width="1.6" opacity=".45"/>`;
O.path = `${sh(32,20)}<path d="M18 50 q6 -14 14 -18 q8 -4 14 -14" stroke="${ENV.wood}" stroke-width="9"
  fill="none" stroke-linecap="round" opacity=".85"/>`;
O.wood = O.log;
O.boat = `${sh()}<path d="M8 40 q24 12 48 0 l-6 8 q-18 6 -36 0 z" fill="${ENV.wood}"/>
  <path d="M32 38 V16" stroke="${ENV.woodDeep}" stroke-width="2.6"/>
  <path d="M33 18 q14 6 0 14 z" fill="#F4EFE2"/>`;
O.net = `${sh()}<path d="M14 26 h36 l-6 22 h-24 z" fill="none" stroke="${ENV.woodDeep}" stroke-width="2.4"/>
  <path d="M20 26 l-3 22 M32 26 v22 M44 26 l3 22 M15 34 h34 M17 41 h30"
  stroke="${ENV.woodDeep}" stroke-width="1.5" opacity=".75"/>`;

// ---- reaching --------------------------------------------------------------
O.ball = `${sh(32,14)}<circle cx="32" cy="34" r="16" fill="${SUNSTONE}"/>
  <path d="M18 28 q14 8 28 0" stroke="#F4EFE2" stroke-width="2.6" fill="none" opacity=".85"/>
  <circle cx="26" cy="28" r="5" fill="#fff" opacity=".3"/>`;
O.basket = `${sh()}<path d="M12 30 h40 l-5 20 h-30 z" fill="${ENV.wood}"/>
  <path d="M14 36 h36 M15 42 h34" stroke="${ENV.woodDeep}" stroke-width="1.8" opacity=".55"/>
  <path d="M18 30 q14 -14 28 0" stroke="${ENV.woodDeep}" stroke-width="3" fill="none"/>`;
O.ribbon = `${sh(32,12)}<path d="M32 26 q-16 -10 -12 4 q3 9 12 4 q9 5 12 -4 q4 -14 -12 -4 z" fill="${SUNSTONE}"/>
  <path d="M30 34 l-6 16 M34 34 l6 16" stroke="${SUNSTONE}" stroke-width="4" stroke-linecap="round"/>`;
O.ladder = `${sh()}<path d="M20 50 L24 16 M44 50 L40 16" stroke="${ENV.wood}" stroke-width="4" stroke-linecap="round"/>
  <path d="M22 42 h20 M23 34 h18 M24 26 h16" stroke="${ENV.wood}" stroke-width="3.4" stroke-linecap="round"/>`;
O.kite = `${sh(32,10)}<path d="M32 12 L48 30 L32 46 L16 30 z" fill="${SUNSTONE}"/>
  <path d="M32 12 v34 M16 30 h32" stroke="#F4EFE2" stroke-width="1.6" opacity=".7"/>
  <path d="M32 46 q6 8 -2 12" stroke="${ENV.woodDeep}" stroke-width="2" fill="none"/>`;
O.hat = `${sh()}<ellipse cx="32" cy="44" rx="24" ry="6" fill="${ENV.wood}"/>
  <path d="M18 44 q0 -22 14 -22 q14 0 14 22 z" fill="${ENV.wood}"/>
  <rect x="18" y="36" width="28" height="6" fill="${SUNSTONE}" opacity=".9"/>`;
O.pole = `${sh(32,10)}<path d="M22 52 L44 14" stroke="${ENV.wood}" stroke-width="5" stroke-linecap="round"/>
  <path d="M44 16 q8 6 2 12" stroke="${ENV.woodDeep}" stroke-width="2" fill="none"/>`;
O.bell = `${sh(32,13)}<path d="M32 14 q14 0 14 20 q0 8 4 12 h-36 q4 -4 4 -12 q0 -20 14 -20 z" fill="${BLOOM_GOLD}"/>
  <circle cx="32" cy="50" r="3.4" fill="${ENV.woodDeep}"/>
  <path d="M24 26 q6 -8 14 -6" stroke="#FFF4D4" stroke-width="2.4" fill="none" opacity=".9"/>`;
O.nest = `${sh()}<path d="M12 38 q20 -12 40 0 q-4 12 -20 12 q-16 0 -20 -12 z" fill="${ENV.woodDeep}"/>
  <path d="M14 38 q18 -9 36 0" stroke="${ENV.wood}" stroke-width="2.6" fill="none"/>
  <ellipse cx="28" cy="38" rx="5" ry="4" fill="#F4EFE2"/><ellipse cx="38" cy="39" rx="5" ry="4" fill="#F4EFE2"/>`;
O.moth = `${sh(32,10)}<path d="M32 34 q-16 -18 -20 -2 q-3 12 20 6 z" fill="${COAT.cream}"/>
  <path d="M32 34 q16 -18 20 -2 q3 12 -20 6 z" fill="${COAT.cream}"/>
  <ellipse cx="32" cy="36" rx="3" ry="9" fill="${INK}"/>`;
O.apple = `${sh(32,12)}<path d="M32 22 q-14 -4 -14 12 q0 14 14 16 q14 -2 14 -16 q0 -16 -14 -12 z" fill="#8FBF6A"/>
  <path d="M32 22 v-8" stroke="${ENV.woodDeep}" stroke-width="2.6"/>
  <path d="M33 16 q9 -5 10 3 q-8 3 -10 -3z" fill="#6F9C4E"/>
  <ellipse cx="25" cy="32" rx="4" ry="6" fill="#fff" opacity=".28"/>`;

// ---- light -----------------------------------------------------------------
const flame = `<path d="M32 12 q7 8 0 14 q-7 -6 0 -14 z" fill="${BLOOM_GOLD}"/>
  <path d="M32 16 q3.5 4.5 0 7.5 q-3.5 -3 0 -7.5z" fill="#FFF4D4"/>`;
O.lamp = `${sh()}<path d="M20 48 h24 l-4 -18 h-16 z" fill="${BLOOM_GOLD}" opacity=".92"/>
  <rect x="26" y="24" width="12" height="7" rx="2" fill="${ENV.woodDeep}"/>${flame}`;
O.light = `${sh(32,12)}<circle cx="32" cy="30" r="14" fill="${BLOOM_GOLD}" opacity=".35"/>
  <circle cx="32" cy="30" r="9" fill="#FFF4D4"/><rect x="27" y="40" width="10" height="8" rx="2" fill="${ENV.woodDeep}"/>`;
O.moon = `${sh(32,10)}<path d="M40 14 a18 18 0 1 0 0 32 a14 14 0 1 1 0 -32 z" fill="#FFF4D4"/>`;
O.match = `${sh(32,8)}<path d="M32 50 V24" stroke="${ENV.wood}" stroke-width="4" stroke-linecap="round"/>${flame}`;
O.sun = `${sh(32,10)}<circle cx="32" cy="30" r="12" fill="${BLOOM_GOLD}"/>
  <path d="M32 10 v6 M32 44 v6 M12 30 h6 M46 30 h6 M18 16 l4 4 M42 40 l4 4 M46 16 l-4 4 M22 40 l-4 4"
  stroke="${BLOOM_GOLD}" stroke-width="3" stroke-linecap="round"/>`;
O.candle = `${sh(32,10)}<rect x="26" y="26" width="12" height="24" rx="3" fill="#F4EFE2"/>
  <rect x="26" y="26" width="4" height="24" fill="#E4DCC9"/>${flame}`;
O.torch = `${sh(32,10)}<rect x="28" y="28" width="8" height="22" rx="3" fill="${ENV.woodDeep}"/>${flame}`;
O.lantern = `${sh()}<path d="M22 22 h20 v24 h-20 z" fill="${BLOOM_GOLD}" opacity=".9"/>
  <rect x="20" y="18" width="24" height="5" rx="2" fill="${ENV.woodDeep}"/>
  <rect x="20" y="45" width="24" height="5" rx="2" fill="${ENV.woodDeep}"/>
  <path d="M26 20 q6 -10 12 0" stroke="${ENV.woodDeep}" stroke-width="2.4" fill="none"/>`;
O.fire = `${sh(32,14)}<path d="M32 14 q12 14 0 26 q-12 -12 0 -26 z" fill="${BLOOM_GOLD}"/>
  <path d="M32 22 q6 8 0 14 q-6 -6 0 -14z" fill="#FFF4D4"/>`;
O.star = `${sh(32,9)}<path d="M32 12 l5 13 14 1 -11 9 4 14 -12 -8 -12 8 4 -14 -11 -9 14 -1 z" fill="${BLOOM_GOLD}"/>`;
O.glow = `${sh(32,9)}<circle cx="32" cy="32" r="15" fill="${BLOOM_GOLD}" opacity=".28"/>
  <circle cx="32" cy="32" r="8" fill="#FFF4D4"/>`;
O.shine = O.glow;
O.window = `${sh()}<rect x="16" y="14" width="32" height="34" rx="3" fill="${BLOOM_GOLD}" opacity=".55"/>
  <rect x="16" y="14" width="32" height="34" rx="3" fill="none" stroke="${ENV.woodDeep}" stroke-width="3.4"/>
  <path d="M32 14 v34 M16 31 h32" stroke="${ENV.woodDeep}" stroke-width="2.6"/>`;

// ---- creatures -------------------------------------------------------------
const creature = (body, ear, extra = '') => `${sh(32,15)}
  <ellipse cx="32" cy="38" rx="16" ry="13" fill="${body}"/>
  <circle cx="32" cy="24" r="11" fill="${body}"/>${ear}
  <circle cx="28" cy="23" r="2" fill="${INK}"/><circle cx="36" cy="23" r="2" fill="${INK}"/>
  <ellipse cx="32" cy="27" rx="2.4" ry="1.8" fill="${INK}"/>${extra}`;
O.bunny = creature('#F0EAE0', `<ellipse cx="27" cy="10" rx="3.4" ry="9" fill="#F0EAE0"/>
  <ellipse cx="37" cy="10" rx="3.4" ry="9" fill="#F0EAE0"/>`);
O.mouse = creature('#C9C3BB', `<circle cx="24" cy="17" r="6" fill="#C9C3BB"/><circle cx="40" cy="17" r="6" fill="#C9C3BB"/>`);
O.cat = creature(COAT_ALT.cream, `<path d="M24 18 L21 8 L31 14 z" fill="${COAT_ALT.cream}"/><path d="M40 18 L43 8 L33 14 z" fill="${COAT_ALT.cream}"/>`);
O.dog = creature(COAT.cream, `<ellipse cx="22" cy="24" rx="4" ry="8" fill="${COAT.ear}"/>
  <ellipse cx="42" cy="24" rx="4" ry="8" fill="${COAT.ear}"/>`);
O.puppy = O.dog;
O.fox = creature('#DE9A5C', `<path d="M23 17 L20 7 L30 13 z" fill="#DE9A5C"/><path d="M41 17 L44 7 L34 13 z" fill="#DE9A5C"/>`);
O.deer = creature('#C79A6E', `<path d="M26 14 l-4 -9 M26 9 l-5 -2 M38 14 l4 -9 M38 9 l5 -2"
  stroke="${ENV.woodDeep}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
O.bird = `${sh(32,12)}<ellipse cx="32" cy="34" rx="14" ry="11" fill="#7FB6C9"/>
  <circle cx="24" cy="26" r="7" fill="#7FB6C9"/><circle cx="22" cy="25" r="1.9" fill="${INK}"/>
  <path d="M16 26 l-6 2 6 2 z" fill="${BLOOM_GOLD}"/><path d="M34 32 q10 4 12 -4 q-8 -2 -12 4z" fill="#6AA0B4"/>`;
O.duck = `${sh(32,12)}<ellipse cx="32" cy="36" rx="15" ry="11" fill="#F4EFE2"/>
  <circle cx="24" cy="26" r="7.5" fill="#F4EFE2"/><circle cx="22" cy="25" r="1.9" fill="${INK}"/>
  <path d="M17 27 q-8 1 0 4 z" fill="${BLOOM_GOLD}"/>`;
O.goose = O.duck;
O.frog = `${sh(32,14)}<ellipse cx="32" cy="38" rx="16" ry="12" fill="#8FBF6A"/>
  <circle cx="25" cy="26" r="6" fill="#8FBF6A"/><circle cx="39" cy="26" r="6" fill="#8FBF6A"/>
  <circle cx="25" cy="25" r="2.4" fill="${INK}"/><circle cx="39" cy="25" r="2.4" fill="${INK}"/>
  <path d="M24 40 q8 5 16 0" stroke="#5F8F45" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
O.fish = `${sh(32,12)}<path d="M14 34 q14 -12 30 0 q-14 12 -30 0 z" fill="#7FB6C9"/>
  <path d="M44 34 l10 -7 v14 z" fill="#6AA0B4"/><circle cx="24" cy="32" r="1.9" fill="${INK}"/>`;
O.sheep = creature('#F2EFE8', `<ellipse cx="23" cy="25" rx="3.4" ry="6" fill="#C9C3BB"/>
  <ellipse cx="41" cy="25" rx="3.4" ry="6" fill="#C9C3BB"/>`,
  `<circle cx="22" cy="34" r="6" fill="#F2EFE8"/><circle cx="42" cy="34" r="6" fill="#F2EFE8"/>`);
O.chick = `${sh(32,10)}<ellipse cx="32" cy="36" rx="12" ry="11" fill="${BLOOM_GOLD}"/>
  <circle cx="32" cy="24" r="8" fill="${BLOOM_GOLD}"/><circle cx="29" cy="23" r="1.9" fill="${INK}"/>
  <path d="M38 24 l6 2 -6 2 z" fill="${SUNSTONE}"/>`;
O.bug = `${sh(32,10)}<ellipse cx="32" cy="36" rx="12" ry="10" fill="${SUNSTONE}"/>
  <path d="M32 26 v20" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="24" r="6" fill="${INK}"/>
  <circle cx="26" cy="34" r="2.2" fill="${INK}"/><circle cx="38" cy="34" r="2.2" fill="${INK}"/>`;
O.hill = `${sh(32,22)}<path d="M6 48 q26 -30 52 0 z" fill="${ENV.hillNear}"/>
  <path d="M6 48 q26 -30 52 0" fill="none" stroke="${ENV.grassDeep}" stroke-width="2" opacity=".6"/>`;
O.whistle = `${sh(32,10)}<path d="M18 30 h22 a8 8 0 0 1 0 16 h-22 z" fill="${BLOOM_GOLD}"/>
  <circle cx="40" cy="38" r="3.4" fill="${ENV.woodDeep}"/>`;

// ---- opening ---------------------------------------------------------------
O.key = `${sh(32,12)}<circle cx="22" cy="28" r="9" fill="none" stroke="${BLOOM_GOLD}" stroke-width="5"/>
  <path d="M30 30 h20 M44 30 v7 M50 30 v7" stroke="${BLOOM_GOLD}" stroke-width="5" stroke-linecap="round"/>`;
O.knob = `${sh(32,11)}<circle cx="32" cy="32" r="12" fill="${BLOOM_GOLD}"/>
  <circle cx="28" cy="28" r="4" fill="#FFF4D4" opacity=".7"/>`;
O.handle = `${sh(32,11)}<path d="M20 24 h16 a8 8 0 0 1 0 16 h-4" stroke="${BLOOM_GOLD}" stroke-width="6"
  fill="none" stroke-linecap="round"/>`;
O.button = `${sh(32,10)}<circle cx="32" cy="32" r="13" fill="${SUNSTONE}"/>
  <circle cx="32" cy="32" r="7" fill="#8A3F22" opacity=".35"/>`;
O.hook = `${sh(32,9)}<path d="M32 16 v14 a9 9 0 1 1 -9 9" stroke="${BLOOM_GOLD}" stroke-width="5"
  fill="none" stroke-linecap="round"/>`;
O.ring = `${sh(32,10)}<circle cx="32" cy="32" r="13" fill="none" stroke="${BLOOM_GOLD}" stroke-width="5"/>`;
O.latch = `${sh()}<rect x="14" y="28" width="36" height="10" rx="4" fill="${BLOOM_GOLD}"/>
  <circle cx="46" cy="33" r="4" fill="${ENV.woodDeep}"/>`;
O.lock = `${sh(32,12)}<rect x="18" y="30" width="28" height="20" rx="4" fill="${BLOOM_GOLD}"/>
  <path d="M24 30 v-6 a8 8 0 0 1 16 0 v6" stroke="${ENV.woodDeep}" stroke-width="4" fill="none"/>
  <circle cx="32" cy="39" r="3" fill="${ENV.woodDeep}"/>`;
O.chain = `${sh(32,14)}<circle cx="20" cy="32" r="7" fill="none" stroke="${BLOOM_GOLD}" stroke-width="4"/>
  <circle cx="32" cy="32" r="7" fill="none" stroke="${BLOOM_GOLD}" stroke-width="4"/>
  <circle cx="44" cy="32" r="7" fill="none" stroke="${BLOOM_GOLD}" stroke-width="4"/>`;
O.gate = `${sh()}<rect x="12" y="20" width="40" height="30" rx="3" fill="none" stroke="${ENV.wood}" stroke-width="4"/>
  <path d="M12 30 h40 M12 40 h40 M26 20 v30 M38 20 v30" stroke="${ENV.wood}" stroke-width="3"/>`;
O.door = `${sh()}<rect x="18" y="14" width="28" height="36" rx="3" fill="${ENV.wood}"/>
  <rect x="22" y="18" width="20" height="28" rx="2" fill="${ENV.woodDeep}" opacity=".35"/>
  <circle cx="40" cy="33" r="2.6" fill="${BLOOM_GOLD}"/>`;
O.magnet = `${sh(32,12)}<path d="M18 46 V30 a14 14 0 0 1 28 0 v16 h-9 V30 a5 5 0 0 0 -10 0 v16 z" fill="#9AA3A8"/>
  <rect x="18" y="42" width="9" height="6" fill="${SUNSTONE}"/><rect x="37" y="42" width="9" height="6" fill="#F4EFE2"/>`;
O.push = `${sh(32,12)}<path d="M24 44 V26 a4 4 0 0 1 8 0 v10" stroke="${COAT.cream}" stroke-width="7"
  fill="none" stroke-linecap="round"/><path d="M32 36 h8 a4 4 0 0 1 0 8 h-16" stroke="${COAT.cream}"
  stroke-width="7" fill="none" stroke-linecap="round"/>`;

// ---- carrying --------------------------------------------------------------
const wheels = `<circle cx="22" cy="48" r="6" fill="${ENV.woodDeep}"/><circle cx="44" cy="48" r="6" fill="${ENV.woodDeep}"/>
  <circle cx="22" cy="48" r="2.2" fill="${ENV.wood}"/><circle cx="44" cy="48" r="2.2" fill="${ENV.wood}"/>`;
O.wagon = `${sh(33,20)}<path d="M12 28 h42 l-4 16 h-34 z" fill="${SUNSTONE}"/>
  <path d="M14 34 h38" stroke="#8A3F22" stroke-width="1.8" opacity=".4"/>${wheels}`;
O.cart = O.wagon;
O.wheel = `${sh(32,13)}<circle cx="32" cy="32" r="16" fill="none" stroke="${ENV.woodDeep}" stroke-width="5"/>
  <circle cx="32" cy="32" r="4" fill="${ENV.woodDeep}"/>
  <path d="M32 18 v10 M32 36 v10 M18 32 h10 M36 32 h10" stroke="${ENV.woodDeep}" stroke-width="3"/>`;
O.sled = `${sh()}<path d="M12 34 h40 v8 h-40 z" fill="${ENV.wood}"/>
  <path d="M10 48 q4 -6 10 -6 h28 q6 0 8 6" stroke="${ENV.woodDeep}" stroke-width="3.4" fill="none"/>`;
O.bag = `${sh(32,14)}<path d="M18 28 h28 l3 22 h-34 z" fill="${ENV.wood}"/>
  <path d="M25 28 v-4 a7 7 0 0 1 14 0 v4" stroke="${ENV.woodDeep}" stroke-width="3" fill="none"/>`;
O.box = `${sh(32,16)}<path d="M12 26 h40 v22 h-40 z" fill="${ENV.wood}"/>
  <path d="M12 26 l6 -6 h28 l6 6" fill="${ENV.woodDeep}" opacity=".55"/>
  <path d="M32 26 v22" stroke="${ENV.woodDeep}" stroke-width="2" opacity=".5"/>`;
O.tray = `${sh(32,20)}<ellipse cx="32" cy="38" rx="22" ry="8" fill="${ENV.wood}"/>
  <ellipse cx="32" cy="36" rx="18" ry="6" fill="${ENV.woodDeep}" opacity=".4"/>`;
O.pillow = `${sh(32,17)}<path d="M14 30 q18 -6 36 0 q4 12 0 18 q-18 6 -36 0 q-4 -6 0 -18 z" fill="#F4EFE2"/>
  <path d="M20 34 q12 -3 24 0" stroke="#E4DCC9" stroke-width="2" fill="none"/>`;
O.melon = `${sh(32,14)}<circle cx="32" cy="34" r="16" fill="#8FBF6A"/>
  <path d="M22 24 q10 20 20 0 M18 34 h28" stroke="#6F9C4E" stroke-width="2.4" fill="none" opacity=".8"/>`;
O.lemon = `${sh(32,12)}<ellipse cx="32" cy="34" rx="15" ry="11" fill="${BLOOM_GOLD}"/>
  <path d="M47 34 h4 M13 34 h4" stroke="#D99436" stroke-width="3" stroke-linecap="round"/>`;

/** Generic fallback -- still drawn, never a glyph. A soft parcel reads as
 *  "a thing" to a pre-reader without pretending to be a specific object. */
const GENERIC = `${sh(32,15)}<path d="M14 28 h36 v20 h-36 z" fill="${ENV.wood}"/>
  <path d="M14 28 l5 -6 h26 l5 6" fill="${ENV.woodDeep}" opacity=".5"/>
  <path d="M32 22 v26" stroke="${SUNSTONE}" stroke-width="3.4"/>
  <path d="M14 36 h36" stroke="${SUNSTONE}" stroke-width="3.4"/>`;

/** Level-5 phrases are the same object with a modifier -- "big log" is a log.
 *  Reusing the head noun's art is correct rather than lazy: the child is being
 *  asked to say a longer phrase about a thing they already recognise, and
 *  drawing a subtly different log would imply the object changed when only the
 *  words did. Resolved by taking the last word, which is the head noun in
 *  every phrase in the lexicon ("big log", "rope up", "golden key"). */
function resolveArtKey(word) {
  if (O[word]) return word;
  const parts = String(word).trim().split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (O[parts[i]]) return parts[i];
  }
  return null;
}

/** Inline SVG for a lexicon word. */
export function objectSvg(word) {
  const key = resolveArtKey(word);
  const art = key ? O[key] : GENERIC;
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="${word}"
            xmlns="http://www.w3.org/2000/svg">${art}</svg>`;
}

export const hasObjectArt = (word) => resolveArtKey(word) !== null;
export const OBJECT_WORDS = Object.keys(O);
