// Build /sounds -- the organic acquisition surface.
//
// THE ASSET WE ALREADY HAD. The lexicon is 85 words, each one phonemically
// validated at build time: gruut can pronounce it, every IPA symbol exists in
// the acoustic model's vocabulary, and the claimed sound really does occur at
// the claimed position. That is a better word list than most of what is
// published on this topic, and it was sitting in the repo being used only by
// the game.
//
// THE ANGLE. Search demand here is enormous and almost entirely anxious:
// "4 year old can't say r", "when should my child say s". Nearly every site
// answering those questions sells therapy, so nearly every answer implies a
// problem. Kide's answer is the true one -- for most of these sounds, at most
// of these ages, the child is on time. Saying so is worth more than a funnel:
// it is the only thing on the page a competitor structurally cannot copy.
//
// Every page therefore leads with reassurance, cites a real source for it, and
// only then offers the words. That ordering is the product.
//
//   node tools/seo/build-sounds.mjs

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { LEX } from '../../public/engine/lexicon.js';
import { NORMS, STAGES, CITATION, CITATION_US, SUBSTITUTIONS, ageWords } from '../../public/engine/norms.js';
import { SOUND_NOTES, SEEN_LINE, SHORT_ANSWER } from './sound-notes.mjs';

const OUT = 'public/sounds';
const ORIGIN = 'https://kide.us';
const POS_LABEL = { initial: 'at the start', medial: 'in the middle', final: 'at the end' };

const ext = (href, label) => `<a href="${href}" rel="nofollow noopener">${label}</a>`;
const usLink = ext(CITATION_US.doi, 'Crowe &amp; McLeod (2020)');
const mlLink = ext(CITATION.doi, 'McLeod &amp; Crowe (2018)');

/* 90% mean bands, Crowe & McLeod 2020, children acquiring English in the US.
   Year-long bands, not a single month, and not an all-positions rule. */
const BAND = {
  p: '2;0–2;11', b: '2;0–2;11', m: '2;0–2;11', n: '2;0–2;11',
  h: '2;0–2;11', w: '2;0–2;11', d: '2;0–2;11',
  t: '3;0–3;11', k: '3;0–3;11', g: '3;0–3;11', ng: '3;0–3;11',
  f: '3;0–3;11', y: '3;0–3;11',
  l: '4;0–4;11', v: '4;0–4;11', sh: '4;0–4;11', ch: '4;0–4;11',
  j: '4;0–4;11', s: '4;0–4;11', z: '4;0–4;11',
  r: '5;0–5;11', dh: '5;0–5;11', zh: '5;0–5;11',
  th: '6;0–6;11',
};

function ageLede(code) {
  const n = NORMS[code];
  const words = ageWords(n.mastery);
  const onTime = `If yours can't yet and they're younger than that, they are on time.`;
  if (code === 's') {
    return `Children are not expected to have a tidy &ldquo;${n.letters}&rdquo; early. `
      + `This page says by about <b>${words}</b> so a parent is not told to worry at the first late week. `
      + `${usLink} found a 90% mean of 51.33 months for this sound, with studies ranging from 24 to 84 months `
      + `(${CITATION_US.doi}). Five and a half sits inside that spread, not on the average. ${onTime}`;
  }
  return `Children can usually say &ldquo;${n.letters}&rdquo; reliably by about <b>${words}</b>. `
    + `${usLink} place the 90% mean for this sound in the ${BAND[code]} band among children acquiring `
    + `English in the United States (${CITATION_US.doi}). ${onTime}`;
}

function ageExplain(code) {
  const n = NORMS[code];
  const words = ageWords(n.mastery);
  if (code === 's') {
    return `For &ldquo;${n.letters}&rdquo;, ${usLink} report a 90% mean of 51.33 months, and the 12 studies `
      + `ranged from 24 to 84 months (${CITATION_US.doi}). &ldquo;By about ${words}&rdquo; sits inside that `
      + `spread. It is not the average those studies found.`;
  }
  const where = n.mastery % 12 === 0
    ? `the birthday just after that band, which is the conservative way to say it to a parent`
    : `a point inside that band`;
  return `For &ldquo;${n.letters}&rdquo;, ${usLink} place the 90% mean in the ${BAND[code]} band `
    + `(${CITATION_US.doi}). &ldquo;By about ${words}&rdquo; is ${where}. It is not a claim that every `
    + `study found that exact month.`;
}

/* -- shared chrome, identical to /guides so nothing looks bolted on -------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* The portfolio OG renderer takes a description, and if you do not send one it
   falls back to the brand tagline for the domain. kide.us is not in that
   registry, so the fallback was the generic "Part of the Growth.Business
   portfolio" — which is what every share of every Kide page has been showing
   underneath the headline. Sending the page's own description costs nothing
   and is the difference between a card that reads like this product and one
   that reads like a directory listing. */
const ogUrl = (title, path, description) =>
  `https://www.growth.business/api/og?domain=kide.us&title=${encodeURIComponent(title)}`
  + (description ? `&description=${encodeURIComponent(description)}` : '')
  + `&template=page&path=${encodeURIComponent(path)}`;

/** The @graph every page in the portfolio carries. */
const baseGraph = (url, name, description) => ([
  { '@type': 'Organization', name: 'Kide', url: ORIGIN, logo: `${ORIGIN}/favicon.ico`,
    parentOrganization: { '@type': 'Organization', name: 'Quizbiz LLC' } },
  { '@type': 'WebSite', name: 'Kide', url: ORIGIN, description },
  { '@type': 'WebPage', name, url, description },
]);

const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem', position: i + 1, name: it[0], item: ORIGIN + it[1],
  })),
});

function page({ path, title, description, jsonLd, body, keywords }) {
  const url = ORIGIN + path;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">\n` : ''}<link rel="canonical" href="${url}">
<meta name="theme-color" content="#56C6E6">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/guides/shared.css">
<link rel="stylesheet" href="/mobile.css">
<meta property="og:site_name" content="Kide">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogUrl(title, path, description)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogUrl(title, path, description)}">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonLd })}</script>
<style>
  .verdict{background:#F2FBF5;border-left:4px solid var(--grass-dark);padding:18px 20px;
           border-radius:0 14px 14px 0;margin:20px 0}
  .verdict p{margin:0;font-size:18px;line-height:1.5}
  .verdict .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.06em;
                text-transform:uppercase;color:var(--grass-dark);margin-bottom:7px}
  .wordgrid{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0 4px}
  .wordgrid span{background:#F6F2E6;border-radius:999px;padding:10px 17px;font-size:17px;font-weight:800}
  .soundgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:11px;margin:18px 0}
  .soundgrid a{background:var(--card);border-radius:16px;padding:15px 13px;text-decoration:none;
               color:var(--ink);box-shadow:0 4px 0 rgba(0,0,0,.05);display:block}
  .soundgrid b{display:block;font-size:25px;line-height:1.1}
  .soundgrid span{font-size:12.5px;color:var(--ink-soft)}
  .stage{margin:22px 0 6px;font-size:15px;line-height:1.45;color:var(--ink-soft)}
  .cite{font-size:13px;color:var(--ink-soft);border-top:1px solid #EFE9DA;padding-top:14px;margin-top:26px}
  .agebar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
  .agebar button{font:inherit;font-size:15px;font-weight:700;padding:11px 16px;min-height:46px;
    border-radius:999px;border:2px solid #EFE9DA;background:#fff;color:var(--ink);cursor:pointer}
  .agebar button[aria-pressed="true"]{background:var(--sun);border-color:var(--sun-deep)}
  .agebar button a{display:block;font-size:12px;font-weight:650;line-height:1.2}
  .soundcard{background:var(--card);border-radius:16px;padding:15px 13px;color:var(--ink);
             box-shadow:0 4px 0 rgba(0,0,0,.05)}
  .soundcard a{text-decoration:none;color:inherit}
  .soundcard b{display:block;font-size:25px;line-height:1.1}
  .soundcard span{display:block;font-size:12.5px;color:var(--ink-soft);margin-top:4px}
  .soundcard span a{font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
  <nav><div class="row">
    <a class="wordmark" href="/">kide</a>
    <div class="nav-links"><a href="/words">Practice</a><a href="/sounds">Sounds</a><a href="/guides">Guides</a></div>
  </div></nav>
${body}
  <footer>
    kide.us — a Quizbiz LLC product
    <div class="links"><a href="/">Home</a> · <a href="/sounds">Sounds</a> · <a href="/guides">Guides</a> · <a href="/privacy">Privacy</a></div>
    <div class="links" style="margin-top:8px">Part of the portfolio network ·
      <a href="https://growth.business/?from=kide.us">growth.business</a></div>
  </footer>
</div>
<script type="module">
  // Parent-facing page: measured, with no identifier of any kind. Child-facing
  // surfaces (/words, /play) send nothing at all. See engine/measure.js.
  import("/engine/measure.js").then((m) => m.start()).catch(() => {});
</script>
</body>
</html>
`;
}

/* -- which sounds we can honestly build a page for ------------------------- */
// Only sounds the product actually practices. A page for a sound with no words
// behind it would be a page written for a search engine rather than a parent,
// and it would rank for a query it cannot answer.
const byCode = new Map();
for (const row of LEX) {
  if (!NORMS[row.ph]) continue;
  if (!byCode.has(row.ph)) byCode.set(row.ph, []);
  byCode.get(row.ph).push(row);
}
const codes = [...byCode.keys()].sort((a, b) => NORMS[a].mastery - NORMS[b].mastery);

mkdirSync(OUT, { recursive: true });
const built = [];

/* -- one page per sound ---------------------------------------------------- */
for (const code of codes) {
  const n = NORMS[code];
  const rows = byCode.get(code);
  const path = `/sounds/${code}`;
  const L = n.letters;

  const positions = [...new Set(rows.map((r) => r.pos))];
  const wordsByPos = positions.map((p) => [p, rows.filter((r) => r.pos === p).map((r) => r.w)]);

  // What is actually different about this sound (tools/seo/sound-notes.mjs).
  // Sixteen pages generated from one template are one page as far as a reader
  // or a crawler is concerned, and the deploy gate blocked the release saying
  // exactly that. Every page now leads with its own idea.
  const note = SOUND_NOTES[code];

  // Don't promise "words to practice" on a page that has three of them. The
  // substance of a thin page is the age answer, the substitution pattern and
  // the sound's own quirk, none of which depend on the word count.
  const title = note?.angle
    ? `The "${L}" sound: ${note.angle}`
    : rows.length >= 5
      ? `The "${L}" sound: when children learn it, and words to practice`
      : `The "${L}" sound: when should my child be saying it?`;
  const description =
    `When children usually learn the "${L}" sound, whether a missing one is on time, `
    + `and words to practice it. The studies are named on the page. Nothing is scored.`;

  // The higher-intent half of the search: what a parent actually HEARS. This
  // also carries the pages whose word list is short -- the reassurance and the
  // named pattern are the substance, and they do not depend on how many words
  // the game happens to practice for this sound.
  const sub = SUBSTITUTIONS[code];
  // /sh used to call the swap "ordinary" and name it palatal fronting without a
  // source that states that. The age above is the cited one; this block does
  // not add a second factual claim.
  const subBlock = !sub ? '' : code === 'sh' ? `
  <h2>If your child says &ldquo;${esc(sub.eg[1])}&rdquo; instead of &ldquo;${esc(sub.eg[0])}&rdquo;</h2>
  <p>You may hear &ldquo;${esc(sub.eg[0])}&rdquo; come out closer to &ldquo;${esc(sub.eg[1])}&rdquo;.
     This page does not give that swap its own age. The age linked above is for the sound itself.
     If the swap is still the main way your child says the word well after that, mention it to
     your doctor or a speech-language pathologist.</p>
  <p><b>Don't correct it in the moment.</b> Saying &ldquo;no, say ${esc(sub.eg[0])}&rdquo; teaches a
     child that talking is a test they can fail, and a child who thinks that talks less. Say the
     word yourself, warmly, and carry on — they get the model without the verdict.</p>
` : `
  <h2>If your child says &ldquo;${esc(sub.eg[1])}&rdquo; instead of &ldquo;${esc(sub.eg[0])}&rdquo;</h2>
  <p>Swapping &ldquo;${esc(sub.says)}&rdquo; in for &ldquo;${L}&rdquo; is a pattern clinicians call
     <b>${esc(sub.name)}</b>. Hearing that swap while the sound is still settling is ordinary.</p>
  <p>This page does not give that pattern its own age. The age that is published, and linked
     above, is for the sound itself. If the swap is still the main way your child says the word
     well after that, mention it — not because the pattern's name means something is wrong, but
     because that is when someone should listen properly.</p>
  <p><b>Don't correct it in the moment.</b> Saying &ldquo;no, say ${esc(sub.eg[0])}&rdquo; teaches a
     child that talking is a test they can fail, and a child who thinks that talks less. Say the
     word yourself, warmly, and carry on — they get the model without the verdict.</p>
`;

  // How the sound is physically made, whether you can show it, and its
  // voiced/voiceless twin. This is the half of the page a parent can act on
  // tonight, and it is different for every sound -- which is the point.
  const mouthBlock = note ? `
  <h2>How &ldquo;${L}&rdquo; is made</h2>
  <p>${note.mouth}</p>
  <p>${SEEN_LINE[note.seen]}</p>${note.twin ? `
  <p><b>&ldquo;${L}&rdquo; and &ldquo;${note.twin.letters}&rdquo; are the same movement.</b>
     For both, ${note.twin.same} — ${note.twin.diff}. Put a hand on your throat and say them
     one after the other: one buzzes and one doesn't. If your child has one of the pair they
     already own the mouth position for the other, which is a much smaller gap than it sounds.</p>` : ''}

  <h2>${esc(note.heading)}</h2>
  <p>${note.insight}${note.source?.url
    ? ` <a href="${esc(note.source.url)}" rel="nofollow noopener">${esc(note.source.short)}</a> (${esc(note.source.url)}).`
    : ''}</p>
  <p><b>Try this.</b> ${note.tip}</p>
` : '';

  const faqs = [
    ...(note?.faq || []),
    ...(sub ? [code === 'sh'
      ? [`What should I do if my child says "${sub.eg[1]}" instead of "${sub.eg[0]}"?`,
        `Say the word yourself and move on. This page does not give that swap an age of its own. `
        + `The age above is for the sound.`]
      : [`My child says "${sub.eg[1]}" instead of "${sub.eg[0]}". Is that normal?`,
        `Yes. Hearing "${sub.eg[1]}" for "${sub.eg[0]}" is a familiar pattern, called `
        + `${sub.name}. Don't correct it in the moment; say the word yourself and move on.`]] : []),
    [`When should my child be able to say "${L}"?`,
     code === 's'
       ? `This page says around ${ageWords(n.mastery)}. ${usLink} (${CITATION_US.doi}) report a 90% mean of 51.33 months for this sound, and the studies ranged from 24 to 84 months. Children who take longer than the mean are still part of typical acquisition.`
       : `Around ${ageWords(n.mastery)}. ${usLink} (${CITATION_US.doi}) place the 90% mean for this sound in the ${BAND[code]} band for children acquiring English in the United States. Children who take longer are still typical.`],
    [`My child is younger than that and can't say "${L}". Should I worry?`,
     `No. A child younger than the age above who isn't producing the sound is doing what the studies describe. `
     + `It is worth mentioning to your doctor if the sound is still absent well after ${ageWords(n.mastery)}, `
     + `or if you or other people often can't understand what your child is saying — that second one matters `
     + `more than any single sound. ${usLink} (${CITATION_US.doi}).`],
    [`How do I practice the "${L}" sound at home?`,
     `Say the word yourself, clearly and unhurried, and let your child have a go. Don't correct `
     + `a wrong attempt — say the word again warmly and move on. Practice works because it is `
     + `repeated and pleasant, not because it is accurate. Kide is built on exactly that rule: `
     + `nothing is scored, and there is no way to fail.`],
    [`Which words to practice for "${L}"?`,
     `Short, concrete words for things a child can picture: ${rows.slice(0, 5).map((r) => r.w).join(', ')}. `
     + `Every word on this page was checked to be sure the "${L}" sound really does occur where we say it does.`],
  ];

  const body = `
  <a class="back-link" href="/sounds">← All sounds</a>
  <p class="eyebrow">Speech sounds</p>
  <h1>The &ldquo;${L}&rdquo; sound</h1>
  <p class="lede">${ageLede(code)}</p>

  <div class="verdict">
    <span class="tag">The short answer</span>
    <!-- Per-sound, from sound-notes.mjs. The fallback template below is
         reached for a sound with no note written yet; it used to be the
         path, which is how seven pages came to open with the same sentence. -->
    <p>${
      SHORT_ANSWER[code]
        || (n.mastery >= 60
          ? `&ldquo;${L}&rdquo; is one of the later sounds. A four-year-old who says &ldquo;${
              esc(sub ? sub.eg[1] : 'something else')
            }&rdquo; instead of &ldquo;${esc(sub ? sub.eg[0] : L)}&rdquo; is not behind — this sound usually doesn't settle until around ${ageWords(n.mastery)}.`
          : `&ldquo;${L}&rdquo; is one of the earlier sounds, usually in place by around ${ageWords(n.mastery)}. `
            + `If your child is past that and still isn't using it, it's worth a mention to your doctor — `
            + `not because something is wrong, but because they're the person who can actually tell you.`)
    } ${usLink} (${CITATION_US.doi}).</p>
  </div>

  ${mouthBlock}
  <!-- The age label goes in verbatim (never trimmed to a whole number: "5 and a
       half" trimmed to "5" would misstate the norm), and the letter is in the
       heading because seven sounds share the 3-year figure and a heading built
       from the age alone would be identical across all of them. -->
  <h2>Where this age comes from</h2>
  <p>${mlLink} reviewed 60 articles describing 64 studies of 26,007 children in 27 languages
     (${CITATION.doi}). For English, using a 90%–100% criterion across eight studies, they report
     mean ages in year-long bands. When a study's ages differed by word position, they recorded the
     youngest age. They did not use an all-positions rule for every study.</p>
  <p>${ageExplain(code)}</p>
  <p>A 50% or 75% criterion lands earlier. ${usLink} tabulate those criteria next to the 90% figures
     (${CITATION_US.doi}). We talk about the later criterion so an early chart does not turn ordinary
     acquisition into a worry.</p>

  ${subBlock}
  <h2>Words to practice, and where the sound falls</h2>
  <p>Every word below was checked at build time to confirm the &ldquo;${L}&rdquo; sound really does
     occur where we claim it does — and that it's a word a young child can picture.</p>
  ${wordsByPos.map(([p, ws]) => `
  <p style="margin-bottom:2px"><b>&ldquo;${L}&rdquo; ${POS_LABEL[p] || p} of the word</b></p>
  <div class="wordgrid">${ws.map((w) => `<span>${esc(w)}</span>`).join('')}</div>`).join('')}

  <h2>How to practice without it becoming a test</h2>
  <p>Say the word yourself first, clearly and slowly. Let your child try. If what comes back isn't
     right, <b>don't correct it</b> — say the word again warmly, and carry on. A child who feels
     tested stops trying, and a child who stops trying gets no practice at all.</p>
  <p>That rule is the whole design of Kide: nothing is scored, your child is never told they got a
     word wrong, and the third attempt always works out regardless.</p>

  <div class="cta-row">
    <p style="margin-bottom:0">Practice these words in a game your child can play alone —
       every line is spoken aloud, so a pre-reader doesn't need you to read it.</p>
    <a class="cta" href="/words">Say it with me — it's free</a>
  </div>

  <h2>Common questions</h2>
  ${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n  ')}

  <p class="cite"><b>Source.</b> ${esc(CITATION.full)}
     <a href="${CITATION.doi}" rel="nofollow noopener">${CITATION.doi}</a><br>
     <b>United States ages.</b> ${esc(CITATION_US.full)}
     <a href="${CITATION_US.doi}" rel="nofollow noopener">${CITATION_US.doi}</a><br>${note?.source ? `
     <b>Also.</b> ${esc(note.source.full)} — ${esc(note.source.note)}.${
       note.source.url ? ` <a href="${note.source.url}" rel="nofollow noopener">${note.source.url}</a>` : ''}<br>` : ''}
     Figures follow a ${CITATION_US.criterion}. The cross-linguistic review uses a ${CITATION.criterion}.
     Kide is practice, not therapy — nothing here
     diagnoses anything, and a child outside these ages may be perfectly typical. If you are
     worried about your child's speech, a speech-language pathologist is the right person to ask.</p>
`;

  writeFileSync(`${OUT}/${code}/index.html`.replace(`${OUT}/`, (mkdirSync(`${OUT}/${code}`, { recursive: true }), `${OUT}/`)),
    page({ path, title, description,
      keywords: `${L} sound, when do children learn ${L}, ${L} sound words, `
        + `speech sounds by age, ${L} sound speech therapy words, child can't say ${L}`,
      jsonLd: [
        ...baseGraph(ORIGIN + path, title, description),
        crumbs([['Home', '/'], ['Sounds', '/sounds'], [`The "${L}" sound`, path]]),
        { '@type': 'Article', headline: title, description,
          author: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
          publisher: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
          mainEntityOfPage: ORIGIN + path,
          citation: [
            { '@type': 'ScholarlyArticle', name: CITATION.full, url: CITATION.doi },
            { '@type': 'ScholarlyArticle', name: CITATION_US.full, url: CITATION_US.doi },
          ] },
        { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({
          '@type': 'Question', name: q,
          acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
      ],
      body }));
  built.push({ path, code, letters: L, mastery: n.mastery, words: rows.length });
}

/* -- the hub, with a real tool on it --------------------------------------- */
// A parent arriving from "when should my child say r" wants one answer about
// one child. Making them read a table is making them do the work; the age
// buttons answer it in a tap. It also gives the page a reason to be linked to.
const hubTitle = 'Speech sounds by age: what your child should be saying, and when';
const hubDesc = 'Tap an age and see which sounds are usually in place and which are still '
  + 'developing. The ages come from the reviews linked on the page. Word lists to practice '
  + 'at home. Free, and nothing is scored.';

const hubBody = `
  <p class="eyebrow">Speech sounds</p>
  <h1>Which sounds should my child have by now?</h1>
  <p class="lede">Tap your child's age. A sound that is still missing is ordinary when the 90% mean in
     ${usLink} falls later than that age (${CITATION_US.doi}).</p>

  <div class="agebar" id="agebar" role="group" aria-label="Child's age">
    ${[24, 30, 36, 42, 48, 60, 72, 84].map((m) =>
      `<button type="button" data-m="${m}" aria-pressed="false">${ageWords(m).replace(' years old', '')}${
        m % 12 === 0 ? ' yrs' : ''}</button>`).join('\n    ')}
  </div>
  <div id="verdict" class="verdict" hidden><span class="tag">At this age</span><p></p></div>

  <h2>Every sound, in the order children learn them</h2>
  <p>These groups follow the 90% criterion in ${usLink}: the mean age by which 90% of children in the
     included US studies produced the sound (${CITATION_US.doi}). Means are grouped into year-long
     bands. Children outside a band are still typical.</p>
  ${STAGES.map((st) => {
    const have = st.codes.filter((c) => NORMS[c]);
    if (!have.length) return '';
    const note = {
      'Early sounds': `90% means in the 2;0–2;11 band, ${usLink} (${CITATION_US.doi})`,
      'Next sounds': `90% means in the 3;0–3;11 band, ${usLink} (${CITATION_US.doi})`,
      'Middle sounds': `90% means in the 3;0–3;11 band, ${usLink} (${CITATION_US.doi})`,
      'Later sounds': `90% means in the 4;0–4;11 band, ${usLink} (${CITATION_US.doi}). For /s/ the 90% mean was 51.33 months, and studies ranged from 24 to 84 months`,
      'Latest sounds': `90% means: /r/, voiced th and zh in the 5;0–5;11 band, voiceless th in the 6;0–6;11 band, ${usLink} (${CITATION_US.doi})`,
    }[st.name] || usLink;
    return `<p class="stage">${st.name} — ${note}</p>
  <div class="soundgrid">${have.map((c) => {
    const n = NORMS[c];
    const link = built.find((b) => b.code === c);
    const href = link ? link.path : '/words';
    const dim = link ? '' : ' style="opacity:.62"';
    return `<div class="soundcard"${dim}><a href="${href}"><b>${n.letters}</b></a><span>${BAND[c]} · ${usLink}</span></div>`;
  }).join('')}</div>`;
  }).join('\n  ')}

  <h2>Then what?</h2>
  <p>If a sound is still missing well past its age, or if people outside your family often can't
     understand your child, that's worth raising with your doctor or a speech-language pathologist.
     Being understood matters much more than any individual sound.</p>
  <p>If everything is on time — which it usually is — practice is still good for it, and it works
     and it helps when it doesn't feel like practice.</p>

  <div class="cta-row">
    <p style="margin-bottom:0">A game your child plays alone. Every line is spoken aloud,
       nothing is scored, and the day ends by itself.</p>
    <a class="cta" href="/words">Say it with me — it's free</a>
  </div>

  <!-- The hub is where a speech-language pathologist can land from
       organic search, since these are the queries their own clients arrive
       with. One line, no interruption to the parent reading. -->
  <p style="margin-top:26px;font-size:15px;color:var(--ink-soft)">Are you a speech-language
     pathologist? There's <a href="/for-slps">a page about the home-practice record</a> —
     what's in it, what it refuses to claim, and why it never leaves the family's device.</p>

  <p class="cite"><b>Source.</b> ${esc(CITATION_US.full)}
     <a href="${CITATION_US.doi}" rel="nofollow noopener">${CITATION_US.doi}</a><br>
     <b>Cross-linguistic review.</b> ${esc(CITATION.full)}
     <a href="${CITATION.doi}" rel="nofollow noopener">${CITATION.doi}</a><br>
     US ages follow a ${CITATION_US.criterion}. Kide is practice, not therapy, and nothing here diagnoses
     anything.</p>

<script type="module">
import { NORMS, ageWords } from '/engine/norms.js';
const bar = document.getElementById('agebar');
const box = document.getElementById('verdict');
bar.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const b = e.target.closest('button'); if (!b) return;
  [...bar.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', x === b));
  const m = +b.dataset.m;
  const codes = Object.keys(NORMS);
  const due = codes.filter((c) => NORMS[c].mastery <= m);
  const later = codes.filter((c) => NORMS[c].mastery > m);
  const list = (cs) => [...new Set(cs.map((c) => NORMS[c].letters))].map((l) => '"' + l + '"').join(', ');
  box.hidden = false;
  const src = '<br><br><a href="${CITATION_US.doi}" rel="nofollow noopener">Crowe &amp; McLeod (2020)</a>';
  box.querySelector('p').innerHTML = (due.length
    ? '<b>Usually in place by ' + ageWords(m) + ':</b> ' + list(due)
      + (later.length ? '<br><br><b>Still developing — normal to be missing:</b> ' + list(later) : '')
    : '<b>At ' + ageWords(m) + ', every sound is still developing.</b> That is expected: '
      + list(later.slice(0, 8)) + ' and the rest all arrive later.') + src;
});
</script>
`;

writeFileSync(`${OUT}/index.html`, page({
  path: '/sounds', title: hubTitle, description: hubDesc,
  keywords: 'speech sounds by age, speech sound development chart, when should my child say r, '
    + 'articulation milestones, speech milestones by age, child speech sounds',
  jsonLd: [
    ...baseGraph(`${ORIGIN}/sounds`, hubTitle, hubDesc),
    crumbs([['Home', '/'], ['Sounds', '/sounds']]),
    { '@type': 'ItemList', name: 'English speech sounds by age of acquisition',
      itemListElement: built.map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: `The "${b.letters}" sound`, url: ORIGIN + b.path })) },
    { '@type': 'FAQPage', mainEntity: [
      ['At what age should my child have all their speech sounds?',
       'Crowe & McLeod (2020) place English consonants in 90% bands by the 4;0–4;11 year, '
       + 'with /r/ and a few fricatives later (https://doi.org/10.1044/2020_AJSLP-19-00168). '
       + 'A child still missing the latest sounds is typical.'],
      ['My 4-year-old says "wabbit" instead of "rabbit". Is that normal?',
       'Yes. Crowe & McLeod (2020) place the 90% mean for /r/ in the 5;0–5;11 band '
       + '(https://doi.org/10.1044/2020_AJSLP-19-00168), so substituting "w" at 4 is still inside '
       + 'the ages those studies describe.'],
      ['When should I actually see a speech-language pathologist?',
       'If a sound is still missing well past its expected age, or if people outside your family '
       + 'often struggle to understand your child. Overall intelligibility matters more than any '
       + 'single sound.'],
    ].map(([q, a]) => ({ '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ],
  body: hubBody,
}));

writeFileSync('tools/seo/sounds-built.json', JSON.stringify({ built }, null, 2) + '\n');
console.log(`/sounds: 1 hub + ${built.length} sound pages`);
console.log(`  ${built.map((b) => b.letters).join(' ')}`);
console.log(`  ${LEX.length} lexicon words surfaced as content`);
