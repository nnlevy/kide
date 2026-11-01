// Build /for-slps -- the clinician acquisition surface.
//
// THE GAP THIS CLOSES. /clinician renders a child's practice record, so it is
// noindex and always will be. That left exactly one route to the only customer
// who has ever been likely to pay for this: a parent forwarding a link. The
// billing works, the artifact works, and no speech-language pathologist who has
// not already met a Kide family can find out that either exists.
//
// WHY THE NUMBERS ARE IMPORTED AND NOT TYPED. Every threshold quoted on this
// page comes from engine/clinical.js at build time. A marketing page that
// states "we won't report a rate under 8 attempts" is making a claim about the
// software's behaviour, and the standard way that claim becomes a lie is that
// somebody tunes the constant and never thinks about the page. Here, changing
// the constant changes the sentence. Nothing on this page can drift from what
// the code actually does.
//
// WHAT THIS PAGE IS NOT ALLOWED TO DO. Clinicians are a credential-driven,
// professionally sceptical audience with a regulator, and the fastest way to
// lose one permanently is to overclaim by a single degree. So the limitations
// section is not a disclaimer at the bottom -- it is the argument. Everything
// asserted here is checked against the code in test-slps.mjs.
//
//   node tools/seo/build-for-slps.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  CI_MASS, METHOD_VERSION,
} from '../../public/engine/clinical.js';
import { CITATION } from '../../public/engine/norms.js';

const OUT = 'public/for-slps';
const PATH = '/for-slps';
const ORIGIN = 'https://kide.us';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const pct = (x) => `${Math.round(x * 100)}%`;
const BROWN_DOI = 'https://doi.org/10.1214/ss/1009213286';
const BROWN = `<a href="${BROWN_DOI}" rel="nofollow noopener">Brown, Cai, and DasGupta (2001)</a>`;
const ECFR = 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312/section-312.2';
const ECFR_LINK = `<a href="${ECFR}" rel="nofollow noopener">16 CFR 312.2</a>`;

const TITLE = 'Kide for speech-language pathologists: home-practice evidence you can put in a chart';
const DESC =
  'A home-practice record with per-phoneme accuracy, adherence, and trend detection — '
  + 'generated on the family\'s device. Free for families. No audio, no voiceprints, and nothing '
  + 'from the practice record reaches a server.';

// Description sent explicitly: without it the portfolio OG renderer falls back
// to the brand tagline, and kide.us is not in that registry, so every share of
// this page showed "Part of the Growth.Business portfolio" under the headline.
const ogUrl = `https://www.growth.business/api/og?domain=kide.us&title=${encodeURIComponent(TITLE)}`
  + `&description=${encodeURIComponent(DESC)}`
  + `&template=page&path=${encodeURIComponent(PATH)}`;

/* The questions an SLP actually asks, answered the way a colleague would answer
   them rather than the way a landing page would. */
const FAQS = [
  ['Is this an assessment?',
   'No, and it is not built to become one. What it is: a longitudinal record of what a child '
   + 'practiced at home and what happened when they did. It describes; you interpret.'],

  ['Does it replace the probe data I take in session?',
   'No. Your probes are elicited, controlled and scored by a clinician. This is unelicited home '
   + 'practice scored on a device. They answer different questions — yours answers "what can this '
   + 'child do when I ask", this answers what happened on the days you were not in the room.'],

  ['How many attempts before a figure means anything?',
   'A rate is not reported until a target has enough spoken tries. A direction of change is not '
   + 'claimed until there are more tries, and even then only when the earlier and later credible '
   + 'intervals do not overlap and the change clears this method\'s minimum. Those floors are '
   + 'rules of this method, not a published norm, and they are printed on the report. A short '
   + 'stretch of home practice is often not enough to separate a real improvement from noise, '
   + 'and the report will say so rather than call it.'],

  ['Why this interval, rather than a wider one?',
   `${BROWN} (${BROWN_DOI}) show that Wald intervals for a binomial proportion have erratic coverage `
   + `at small samples, including near 0% and 100%, and recommend an equal-tailed Jeffreys interval `
   + `for small n. The ${pct(CI_MASS)} probability mass, rather than a wider one, is a choice of this `
   + `method: at the sample sizes a home programme produces, a very wide interval is easy to misread. `
   + `The mass is printed on every report.`],

  ['What is excluded from the accuracy figures?',
   'Two things, and both counts are printed on the report rather than quietly dropped. Taps are '
   + 'excluded, because the child produced no speech and counting them would inflate every rate — '
   + 'most for the children who talk least, which is precisely backwards. Attempts resolved on the '
   + 'encouragement cap are excluded too: the game moves on regardless of what was heard, which is '
   + 'right for the child and meaningless as measurement.'],

  ['Do I become a data processor if a family shares a record with me?',
   'No. The record never reaches us, and sharing it does not create an account. It lives in the family\'s browser, and '
   + 'sharing produces a link with the data encoded in the URL, which opens on your device directly. '
   + 'No audio, no voiceprint, no embedding — the record holds phoneme-level outcomes, timestamps '
   + 'and a first name. The amended COPPA Rule lists voiceprints as biometric personal information '
   + `(${ECFR_LINK}, ${ECFR}), which is one reason none is ever created.`],

  ['What does it cost the family?',
   'Nothing, permanently. The game is free, the practice record is free, and a parent can hand you '
   + 'the full record without paying. There is no trial and no upgrade prompt aimed at parents.'],

  ['Then what am I paying for?',
   'The documentation wrapper, once. A header identifying you, your setting, the child by your own '
   + 'chart reference and the period covered; the full method appendix in a form a colleague or a '
   + 'funder can check; and an attestation and signature block. Every measurement stays free — you '
   + 'are paying to stop retyping the numbers into a chart-ready document, not to see them.'],

  ['What is the biggest limitation I should know about?',
   'The scoring thresholds behind these figures are measured, but on adult speech. Every number on '
   + 'the report inherits that, the report says so, and it is the first thing to weigh when a '
   + 'figure surprises you.'],
];

const JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: 'Kide', url: ORIGIN, logo: `${ORIGIN}/favicon.ico`,
      parentOrganization: { '@type': 'Organization', name: 'Quizbiz LLC' } },
    { '@type': 'WebSite', name: 'Kide', url: ORIGIN, description: DESC },
    { '@type': 'WebPage', name: TITLE, url: ORIGIN + PATH, description: DESC },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'For speech-language pathologists', item: ORIGIN + PATH },
    ] },
    { '@type': 'Article', headline: TITLE, description: DESC,
      author: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
      publisher: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
      mainEntityOfPage: ORIGIN + PATH,
      citation: { '@type': 'ScholarlyArticle', name: CITATION.full, url: CITATION.doi } },
    { '@type': 'FAQPage', mainEntity: FAQS.map(([q, a]) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
  ],
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="keywords" content="speech therapy home practice tracking, articulation data collection, SLP progress monitoring, home programme adherence, speech therapy documentation, carryover data">
<link rel="canonical" href="${ORIGIN}${PATH}">
<meta name="theme-color" content="#56C6E6">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/guides/shared.css">
<link rel="stylesheet" href="/mobile.css">
<meta property="og:site_name" content="Kide">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:url" content="${ORIGIN}${PATH}">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITLE)}">
<meta name="twitter:description" content="${esc(DESC)}">
<meta name="twitter:image" content="${ogUrl}">
<script type="application/ld+json">${JSON.stringify(JSONLD)}</script>
<style>
  .verdict{background:#F2FBF5;border-left:4px solid var(--grass-dark);padding:18px 20px;
           border-radius:0 14px 14px 0;margin:20px 0}
  .verdict p{margin:0 0 8px;font-size:18px;line-height:1.5}
  .verdict p:last-child{margin-bottom:0}
  .verdict .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.06em;
                text-transform:uppercase;color:var(--grass-dark);margin-bottom:7px}
  .spec{width:100%;border-collapse:collapse;margin:16px 0;font-size:15.5px}
  .spec td{padding:11px 4px;border-bottom:1px solid #EFE9DA;vertical-align:top}
  .spec td:first-child{font-weight:800;width:38%}
  .refuse{border:1px dashed #D9CFB6;border-radius:14px;padding:18px 20px;margin:20px 0;background:#FFFDF7}
  .refuse h3{margin:0 0 10px;font-size:17px}
  .refuse ul{margin:0;padding-left:20px}
  .refuse li{margin:7px 0}
  .cite{font-size:13px;color:var(--ink-soft);border-top:1px solid #EFE9DA;padding-top:14px;margin-top:26px}
  a.tap{display:inline-flex;align-items:center;min-height:44px;padding:0 2px}
</style>
</head>
<body>
<div class="wrap">
  <nav><div class="row">
    <a class="wordmark" href="/">kide</a>
    <div class="nav-links"><a href="/words">Practice</a><a href="/sounds">Sounds</a><a href="/guides">Guides</a></div>
  </div></nav>

  <p class="eyebrow">For speech-language pathologists</p>
  <h1>&ldquo;Parent reports good carryover.&rdquo;</h1>
  <p class="lede">That sentence is what a lot of progress notes have to go on. Home practice is
     the part of a child&rsquo;s programme that usually comes back as recall — a laminated sheet
     goes home, and the note cannot show whether it was used.</p>

  <div class="verdict">
    <span class="tag">What this is</span>
    <p>Kide is a free speech-practice game for young children. It runs on the family&rsquo;s
       device, scores pronunciation attempts on-device, and keeps a record of what was practiced
       and what happened.</p>
    <p>A parent can hand you that record as a link. You get per-phoneme accuracy with credible
       intervals (${BROWN} recommend Jeffreys intervals at small samples, ${BROWN_DOI}), adherence
       from the practice itself, and a trend readout that refuses to call a direction it cannot support.</p>
  </div>

  <h2>What is actually in the record</h2>
  <table class="spec"><tbody>
    <tr><td>Produced correctly, by target</td>
        <td>Proportion of attempts scored as clearly produced, per phoneme and word position, with
            a Jeffreys ${pct(CI_MASS)} credible interval on each. ${BROWN} (${BROWN_DOI}) recommend
            an equal-tailed Jeffreys interval when the sample is small, because Wald coverage is
            erratic near 0% and 100%. The ${pct(CI_MASS)} mass is this method's choice, not a figure
            from that paper.</td></tr>
    <tr><td>Adherence</td>
        <td>Days practiced out of days elapsed, number of sessions, attempts per session, longest
            break, and days since last practice.</td></tr>
    <tr><td>Direction of change</td>
        <td>Earlier half versus later half of the record, reported only when the evidence supports
            a claim — see the thresholds below.</td></tr>
    <tr><td>Exclusions, disclosed</td>
        <td>Counts of taps and of attempts resolved on the encouragement cap, printed on the
            report rather than silently dropped.</td></tr>
    <tr><td>Underlying data</td>
        <td>Exportable as JSON from the report itself, so you can check any figure rather than
            take it on faith.</td></tr>
    <tr><td>Method version</td>
        <td><code>${esc(METHOD_VERSION)}</code>, stamped on every report.</td></tr>
  </tbody></table>

  <div class="refuse">
    <h3>What it refuses to do — which is the part worth reading</h3>
    <ul>
      <li><b>It does not diagnose.</b> It is not an assessment, and it is not built to become one.
          The design treats that as permanent rather than as a limitation to engineer away.</li>
      <li><b>No rate until there are enough spoken tries.</b> That floor is a rule of this
          method, printed on the report. An interval over a handful of attempts is not evidence,
          and printing one invites over-interpretation.</li>
      <li><b>No direction of change until there are more tries</b>, and then only
          when the intervals do not overlap <i>and</i> the change clears this method&rsquo;s
          minimum. Those cutoffs are rules of this method, printed on the report.</li>
      <li><b>A tap is not counted as speech.</b> The child produced nothing to score. Counting taps
          would inflate every rate, and most for the children who talk least.</li>
      <li><b>It never reads the game&rsquo;s own scheduling state.</b> The engine keeps a decayed,
          deliberately biased estimate to choose what to practice next; that is correct for
          selection and wrong for inference. The evidence layer keeps a separate accumulator over
          raw attempt events, and a test enforces the separation. Otherwise you would be reading an
          artefact of our scheduler.</li>
      <li><b>Thresholds are calibrated on adult speech.</b> Every figure inherits that limitation
          and the report says so.</li>
    </ul>
  </div>

  <h2>You do not become a data processor</h2>
  <p>A parent account is separate from this record, and a family does not need one to share it. Nothing a child says is recorded, transmitted or stored: scoring
     happens on the device, and the record holds phoneme-level outcomes, timestamps and a first
     name. No audio, no voiceprint, no embedding that could re-identify a child — the amended COPPA
     Rule lists voiceprints as biometric personal information (${ECFR_LINK}, ${ECFR}), which is one
     reason none is ever created.</p>
  <p>Sharing is a link with the data encoded in the URL. It opens on your device straight from the
     link. The record does not reach our servers on the way, because there is no route by which it
     could.</p>

  <h2>What it costs</h2>
  <p><b>Nothing, for the family, permanently.</b> The game is free, the practice record is free, and
     a parent can hand you the complete record — every number on it — without paying and without
     signing in. There is no trial, and no upgrade prompt pointed at parents.</p>
  <p><b>A one-time licence, for you, and only for the paperwork.</b> The price is on the
     <a class="tap" href="/clinician/">clinician page</a>, next to the licence. The professional edition adds a
     header identifying you, your setting, the child by your own chart reference and the period covered;
     the full method appendix in a form a colleague or a funder can check; and an attestation and
     signature block. It is the difference between a page you can read and a document you can file.
     Not a subscription, not per child, not per report.</p>

  <div class="cta-row">
    <p style="margin-bottom:0">The fastest way to judge this is to look at one. The worked example
       includes a genuine lapse, an improving target, a flat target and one with
       too little data to report — so you can see what it does when the evidence is thin.</p>
    <a class="cta" href="/clinician/?demo=1">Open a worked example</a>
  </div>

  <h2>How a family starts</h2>
  <p>They open <a href="/words">kide.us/words</a> and play. Nothing to install, no card, and no account is required to start.
     Practice starts producing a record immediately, and the parent surface at
     <a href="/parent">kide.us/parent</a> is where they generate the link for you.</p>
  <p>If you would rather point a family at a specific sound, every phoneme the game practices has a
     page written for parents — <a href="/sounds">kide.us/sounds</a> — with the acquisition norms,
     the substitution pattern, and words checked at build time to carry the target in the claimed
     position.</p>

  <h2>Questions</h2>
  ${FAQS.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n  ')}

  <p class="cite"><b>Acquisition norms.</b> ${esc(CITATION.full)}
     <a href="${CITATION.doi}" rel="nofollow noopener">${CITATION.doi}</a>
     That review reports a ${esc(CITATION.criterion)}.
     <a href="https://doi.org/10.1044/2020_AJSLP-19-00168" rel="nofollow noopener">Crowe &amp; McLeod (2020)</a>
     is the US review the sound pages use for a parent's age.<br>
     Kide is practice, not therapy. Nothing here diagnoses anything, nothing here is a standardised
     assessment, and none of it replaces clinical judgement. It reports what a child practiced and
     what happened, with the uncertainty attached, so that a qualified person can decide what it
     means.</p>

  <footer>
    kide.us — a Quizbiz LLC product
    <div class="links"><a href="/">Home</a> · <a href="/sounds">Sounds</a> · <a href="/guides">Guides</a> · <a href="/privacy">Privacy</a></div>
    <div class="links" style="margin-top:8px">Part of the portfolio network ·
      <a href="https://growth.business/?from=kide.us">growth.business</a></div>
  </footer>
</div>
<script type="module">
  // Professional-facing page, so it is measured on the same identifier-free
  // first-party basis as the other adult surfaces. Child-facing pages send
  // nothing at all. See engine/measure.js.
  import("/engine/measure.js").then((m) => m.start()).catch(() => {});
</script>
</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
console.log(`/for-slps: 1 page, ${FAQS.length} questions, thresholds imported from clinical.js`);
