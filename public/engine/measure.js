// measure.js -- knowing what works, without tracking a child.
//
// THE CONSTRAINT THAT SHAPES THIS. kide.us is directed to children aged about
// 2-7. Under COPPA's amended Rule a persistent identifier collected from a
// child-directed service IS personal information. The portfolio's standard
// analytics stack -- GA4 plus a first-party beacon -- sets exactly that kind of
// identifier, so it cannot simply be pasted in here.
//
// But flying blind is also a real cost: without knowing which pages bring
// parents in, there is no way to decide what to write next, and the content
// surface is the whole acquisition strategy.
//
// THE SPLIT THAT RESOLVES IT. This product has two audiences on two sets of
// routes, and they are cleanly separable:
//
//   PARENT surfaces  /, /sounds, /sounds/*, /guides, /guides/*, /privacy, /terms
//     An adult reading about speech development. Measured.
//
//   CHILD surfaces   /words, /play, /parent, /clinician
//     A child playing, or their practice record. NEVER measured. Not reduced
//     measurement, not anonymised measurement -- no beacon is sent at all.
//
// The route list is an allow-list, so a new page is unmeasured until someone
// deliberately adds it. Defaulting the other way would eventually put a beacon
// on a child's screen by inattention.
//
// NO IDENTIFIER, PERSISTENT OR OTHERWISE. No cookie, no localStorage, no
// fingerprint, no user id, no session id that survives a reload. Events carry
// the page and nothing that could join two visits together. This is weaker
// analytics than the rest of the portfolio has, on purpose: it can answer
// "which pages bring people in" and it cannot answer "what did this person do",
// and only the first question is any of our business here.

const ENDPOINT = 'https://www.riskfreetrial.org/api/analytics';
const DOMAIN = 'kide.us';

/** Parent-facing routes only. An allow-list, never a block-list. */
const MEASURED = [
  /^\/$/,
  /^\/sounds(\/[a-z]+)?\/?$/,
  /^\/guides(\/[a-z0-9-]+)?\/?$/,
  /^\/(privacy|terms)\/?$/,
];

export const isMeasured = (path) => MEASURED.some((rx) => rx.test(path));

function send(eventName, label, destination) {
  try {
    const body = JSON.stringify({
      eventName,
      page: DOMAIN + location.pathname,
      domain: DOMAIN,
      // `label` is page-derived only -- a heading, a button's own text. Never
      // anything typed by a person, and never anything about a child.
      label: label || '',
      destination: destination || '',
      referrer: document.referrer ? new URL(document.referrer).origin : '',
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true,
        headers: { 'Content-Type': 'application/json' } });
    }
  } catch { /* measurement must never affect the page */ }
}

export function start() {
  if (typeof location === 'undefined' || !isMeasured(location.pathname)) return false;

  // Respect the browser-level opt-outs. Both are advisory in law and honoured
  // here anyway -- a parent who has set them has said what they want.
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return false;

  send('page_view');

  // Did they get far enough down to have read it? The single most useful
  // signal for deciding whether a page is worth writing more like.
  let fired = false;
  addEventListener('scroll', () => {
    if (fired) return;
    const d = document.documentElement;
    const depth = (scrollY + innerHeight) / Math.max(d.scrollHeight, 1);
    if (depth >= 0.5) { fired = true; send('scroll_50'); }
  }, { passive: true });

  // Which call to action actually moves a parent into the product.
  addEventListener('click', (e) => {
    const a = e.target.closest('a, button');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    send(href && !href.startsWith('/') && !href.includes(DOMAIN) ? 'cross_domain_click' : 'cta_click',
         (a.textContent || '').trim().slice(0, 60), href);
  }, { passive: true, capture: true });

  return true;
}
