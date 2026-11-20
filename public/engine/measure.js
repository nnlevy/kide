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
//   PARENT surfaces  /, /sounds, /sounds/*, /guides, /guides/*,
//                    /for-slps, /make, /cast
//     An adult reading about speech development, a clinician reading about the
//     record, a parent building a card, or a parent on the Cast Club welcome
//     page. Measured.
//
//     /privacy and /terms do not load this file, so they are not measured.
//     /cast/app is a child's screen and is not measured.
//
//     /for-slps was loading this module and was NOT on the list, so the one
//     page built to reach the only customer who pays reported nothing at all --
//     500 clinicians could have read it and bounced without a trace. The file
//     already says why that matters: "flying blind is also a real cost".
//
//     /make is the top of the sharing loop. If nobody can tell whether the card
//     builder is used, nobody can tell whether it was worth building.
//
//   CHILD surfaces   /words, /play, /parent, /clinician, /cast/app
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

/* CANONICAL HOST, NO www. AND THIS IS NOT A TIDY-UP.
 *
 * www.riskfreetrial.org answers /api/analytics with a 301 to the apex — on the
 * POST *and on the CORS preflight*. A preflight that redirects simply fails:
 * browsers do not follow redirects on preflighted requests, and sendBeacon with
 * an application/json Blob is preflighted because JSON is not a CORS-safelisted
 * content type. So every beacon this file has ever sent was dropped before it
 * left the browser, on every measured page, since the day it shipped.
 *
 * Nothing looked wrong from here: send() is wrapped in try/catch by design
 * ("measurement must never affect the page"), so the failure was silent at both
 * ends — no console error, no missing data anyone could point at, just an empty
 * dashboard that read as "no traffic yet".
 *
 * Verified: www -> 301 on POST and on OPTIONS; apex -> 204 on the real payload.
 *
 * CREDENTIALS MODE. sendBeacon always sends with credentials mode "include".
 * The apex answers the CORS check with an empty Access-Control-Allow-Credentials,
 * which the browser rejects whenever the request's credentials mode is include.
 * That dropped every visit on /, /for-slps, /guides and /sounds: the request
 * never left the browser, and send() swallowed it. fetch with credentials
 * "omit" is the request the host accepts. keepalive is what keeps that note
 * alive across the next navigation, which is the only reason sendBeacon was
 * used. Do not switch this call back to sendBeacon.
 */
const ENDPOINT = 'https://riskfreetrial.org/api/analytics';
const DOMAIN = 'kide.us';

/** Parent-facing routes only. An allow-list, never a block-list. */
const MEASURED = [
  /^\/$/,
  /^\/sounds(\/[a-z]+)?\/?$/,
  /^\/guides(\/[a-z0-9-]+)?\/?$/,
  /^\/for-slps\/?$/,
  /^\/make\/?$/,
  // The public Cast Club page only. /cast/app is a child's screen.
  /^\/cast\/?$/,
];

export const isMeasured = (path) => MEASURED.some((rx) => rx.test(path));

/* WHAT A TAP MAY SAY. On the card maker (/make) the buttons ARE the card: a
 * button's words can be a child's name or a choice about how they look, and the
 * finished card's link carries the names and the note in its query string. So:
 *
 *   - a destination never carries anything after its path. No query, no hash,
 *     on any page. "Where does this go" is the useful part; the rest is content.
 *   - on routes listed in NO_TEXT, a tap's label is only the control's declared
 *     role (data-measure="share"), never its words. An unlabelled control sends
 *     no label at all.
 */
const NO_TEXT = [/^\/make\/?$/];

export function destinationOf(href) {
  if (!href) return '';
  if (/^(mailto|tel|sms):/i.test(href)) return href.split(':')[0].toLowerCase() + ':';
  try {
    const u = new URL(href, 'https://' + DOMAIN);
    return href.startsWith('/') || u.hostname === DOMAIN ? u.pathname : u.origin + u.pathname;
  } catch { return ''; }
}

export function labelOf(el, path) {
  const role = (el.getAttribute && el.getAttribute('data-measure')) || '';
  if (NO_TEXT.some((rx) => rx.test(path))) return role.slice(0, 60);
  return role || (el.textContent || '').trim().slice(0, 60);
}

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
    // credentials: 'omit' — see the note above ENDPOINT. A rejected promise
    // must not surface as an unhandled error on the page.
    fetch(ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
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
         labelOf(a, location.pathname), destinationOf(href));
  }, { passive: true, capture: true });

  return true;
}
