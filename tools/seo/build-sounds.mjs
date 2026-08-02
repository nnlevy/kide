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
import { NORMS, STAGES, CITATION, SUBSTITUTIONS, ageWords, ageLabel } from '../../public/engine/norms.js';
import { SOUND_NOTES, SEEN_LINE, SHORT_ANSWER } from './sound-notes.mjs';

const OUT = 'public/sounds';
const ORIGIN = 'https://kide.us';
const POS_LABEL = { initial: 'at the start', medial: 'in the middle', final: 'at the end' };

/* -- shared chrome, identical to /guides so nothing looks bolted on -------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const ogUrl = (title, path) =>
  `https://www.growth.business/api/og?domain=kide.us&title=${encodeURIComponent(title)}`
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
<meta property="og:image" content="${ogUrl(title, path)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogUrl(title, path)}">
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
  .stage{margin:22px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint)}
  .cite{font-size:13px;color:var(--ink-soft);border-top:1px solid #EFE9DA;padding-top:14px;margin-top:26px}
  .agebar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
  .agebar button{font:inherit;font-size:15px;font-weight:700;padding:11px 16px;min-height:46px;
    border-radius:999px;border:2px solid #EFE9DA;background:#fff;color:var(--ink);cursor:pointer}
  .agebar button[aria-pressed="true"]{background:var(--sun);border-color:var(--sun-deep)}
</style>
</head>
<body>
<div class="wrap">
  <nav><div class="row">
    <a class="wordmark" href="/">kide</a>
    <div class="nav-links"><a href="/words">Practise</a><a href="/sounds">Sounds</a><a href="/guides">Guides</a></div>
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
// Only sounds the product actually practises. A page for a sound with no words
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

  // Don't promise "words to practise" on a page that has three of them. The
  // substance of a thin page is the age answer, the substitution pattern and
  // the sound's own quirk, none of which depend on the word count.
  const title = note?.angle
    ? `The "${L}" sound: ${note.angle}`
    : rows.length >= 5
      ? `The "${L}" sound: when children learn it, and words to practise`
      : `The "${L}" sound: when should my child be saying it?`;
  const description =
    `Most children have "${L}" by about ${ageWords(n.mastery)} (${CITATION.short}). `
    + `If your child isn't saying it yet, here's whether that's on time — and `
    + `${rows.length} words to practise it with, with no pressure and no scoring.`;

  // The higher-intent half of the search: what a parent actually HEARS. This
  // also carries the pages whose word list is short -- the reassurance and the
  // named pattern are the substance, and they do not depend on how many words
  // the game happens to practise for this sound.
  const sub = SUBSTITUTIONS[code];
  const subBlock = sub ? `
  <h2>If your child says &ldquo;${esc(sub.eg[1])}&rdquo; instead of &ldquo;${esc(sub.eg[0])}&rdquo;</h2>
  <p>Swapping &ldquo;${sub.says}&rdquo; in for &ldquo;${L}&rdquo; is not a random mistake. It has a
     name — <b>${sub.name}</b> — and it is one of the most common and best documented patterns in
     young children's speech. Nearly every child does some version of it.</p>
  <p>It usually sorts itself out by around <b>${ageWords(sub.by)}</b>. Before then it is a normal
     stage, not an error to be corrected. ${
       sub.by > 60
         ? 'This one lasts longer than parents expect, which is exactly why it causes so much unnecessary worry.'
         : 'If it is still there well after that, it is worth mentioning — not because something is wrong, but because that is when someone should take a proper look.'
     }</p>
  <p><b>Don't correct it in the moment.</b> Saying &ldquo;no, say ${esc(sub.eg[0])}&rdquo; teaches a
     child that talking is a test they can fail, and a child who thinks that talks less. Say the
     word yourself, warmly, and carry on — they get the model without the verdict.</p>
` : '';

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
  <p>${note.insight}</p>
  <p><b>Try this.</b> ${note.tip}</p>
` : '';

  const faqs = [
    ...(note?.faq || []),
    ...(sub ? [[`My child says "${sub.eg[1]}" instead of "${sub.eg[0]}". Is that normal?`,
      `Yes — very. Substituting "${sub.says}" for "${L}" is a documented pattern called `
      + `${sub.name}, and it typically resolves on its own by around ${ageWords(sub.by)}. `
      + `Don't correct it in the moment; just say the word yourself and move on.`]] : []),
    [`When should my child be able to say "${L}"?`,
     `Around ${ageWords(n.mastery)}. That figure is the 90% mastery age from ${CITATION.short}, `
     + `meaning 90% of typically developing children produce "${L}" correctly in every `
     + `position in a word by then. The 10% who take longer are still typical.`],
    [`My child is younger than that and can't say "${L}". Should I worry?`,
     `No. A child below the expected age who isn't producing a sound is doing exactly what `
     + `the research predicts. It is worth mentioning to your doctor if the sound is still `
     + `absent well after ${ageWords(n.mastery)}, or if you or other people often can't `
     + `understand what your child is saying — that second one matters more than any single sound.`],
    [`How do I practise the "${L}" sound at home?`,
     `Say the word yourself, clearly and unhurried, and let your child have a go. Don't correct `
     + `a wrong attempt — say the word again warmly and move on. Practice works because it is `
     + `repeated and pleasant, not because it is accurate. Kide is built on exactly that rule: `
     + `nothing is scored, and there is no way to fail.`],
    [`Which words are best for practising "${L}"?`,
     `Short, concrete words for things a child can picture: ${rows.slice(0, 5).map((r) => r.w).join(', ')}. `
     + `Every word on this page was checked to be sure the "${L}" sound really does occur where we say it does.`],
  ];

  const body = `
  <a class="back-link" href="/sounds">← All sounds</a>
  <p class="eyebrow">Speech sounds</p>
  <h1>The &ldquo;${L}&rdquo; sound</h1>
  <p class="lede">Most children can say &ldquo;${L}&rdquo; reliably by about <b>${ageWords(n.mastery)}</b>.
     If yours can't yet and they're younger than that, they are on time.</p>

  <div class="verdict">
    <span class="tag">The short answer</span>
    <!-- Per-sound, from sound-notes.mjs. The fallback template below is only
         reached for a sound with no note written yet; it used to be the ONLY
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
    }</p>
  </div>

  ${mouthBlock}
  <!-- The age label goes in verbatim (never trimmed to a whole number: "5 and a
       half" trimmed to "5" would misstate the norm), and the letter is in the
       heading because seven sounds share the 3-year figure and a heading built
       from the age alone would be identical across all of them. -->
  <h2>Where the &ldquo;${L}&rdquo; figure of ${ageWords(n.mastery)} comes from</h2>
  <p>${CITATION.short} reviewed consonant acquisition across 64 studies and reported the age by
     which 90% of typically developing children produce each sound correctly — in the beginning,
     middle <i>and</i> end of words. For &ldquo;${L}&rdquo; that age is <b>${ageLabel(n.mastery)}</b>
     (${ageWords(n.mastery)}).</p>
  <p>The 90% figure is deliberately conservative. Older charts used 50% or 75%, which produce much
     earlier ages and flag ordinary late acquisition as a problem. We use the conservative number on
     purpose: an earlier one would manufacture worry rather than answer it.</p>

  ${subBlock}
  <h2>Words to practise, and where the sound falls</h2>
  <p>Every word below was checked at build time to confirm the &ldquo;${L}&rdquo; sound really does
     occur where we claim it does — and that it's a word a two- to seven-year-old can picture.</p>
  ${wordsByPos.map(([p, ws]) => `
  <p style="margin-bottom:2px"><b>&ldquo;${L}&rdquo; ${POS_LABEL[p] || p} of the word</b></p>
  <div class="wordgrid">${ws.map((w) => `<span>${esc(w)}</span>`).join('')}</div>`).join('')}

  <h2>How to practise without it becoming a test</h2>
  <p>Say the word yourself first, clearly and slowly. Let your child try. If what comes back isn't
     right, <b>don't correct it</b> — say the word again warmly, and carry on. A child who feels
     tested stops trying, and a child who stops trying gets no practice at all.</p>
  <p>That rule is the whole design of Kide: nothing is scored, your child is never told they got a
     word wrong, and the third attempt always works out regardless.</p>

  <div class="cta-row">
    <p style="margin-bottom:0">Practise these words in a game your child can play alone —
       every line is spoken aloud, so a pre-reader doesn't need you to read it.</p>
    <a class="cta" href="/words">Say it with me — it's free</a>
  </div>

  <h2>Common questions</h2>
  ${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n  ')}

  <p class="cite"><b>Source.</b> ${esc(CITATION.full)}
     <a href="${CITATION.doi}" rel="nofollow noopener">${CITATION.doi}</a><br>${note?.source ? `
     <b>Also.</b> ${esc(note.source.full)} — ${esc(note.source.note)}.${
       note.source.url ? ` <a href="${note.source.url}" rel="nofollow noopener">${note.source.url}</a>` : ''}<br>` : ''}
     Figures are ${CITATION.criterion}. Kide is practice, not therapy — nothing here
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
          citation: { '@type': 'ScholarlyArticle', name: CITATION.full, url: CITATION.doi } },
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
const hubDesc = 'Enter your child\'s age and see which sounds are expected and which are still '
  + 'developing — based on McLeod & Crowe (2018), the 90% standard clinicians use. Plus '
  + 'validated word lists to practise each sound at home. Free, and nothing is scored.';

const hubBody = `
  <p class="eyebrow">Speech sounds</p>
  <h1>Which sounds should my child have by now?</h1>
  <p class="lede">Tap an age. We'll show you which sounds are usually in place by then, and which
     ones are still perfectly normal to be missing — using the same 90% figures a
     speech-language pathologist would use.</p>

  <div class="agebar" id="agebar" role="group" aria-label="Child's age">
    ${[24, 30, 36, 42, 48, 60, 72, 84].map((m) =>
      `<button data-m="${m}" aria-pressed="false">${ageWords(m).replace(' years old', '')}${
        m % 12 === 0 ? ' yrs' : ''}</button>`).join('\n    ')}
  </div>
  <div id="verdict" class="verdict" hidden><span class="tag">At this age</span><p></p></div>

  <h2>Every sound, in the order children learn them</h2>
  <p>These are 90% mastery ages: the point by which 90% of typically developing children produce
     the sound correctly in every position in a word. The other 10% are still typical.</p>
  ${STAGES.map((st) => {
    const have = st.codes.filter((c) => NORMS[c]);
    if (!have.length) return '';
    return `<p class="stage">${st.name} — usually by ${ageWords(st.by)}</p>
  <div class="soundgrid">${have.map((c) => {
    const n = NORMS[c];
    const link = built.find((b) => b.code === c);
    const inner = `<b>${n.letters}</b><span>by ${ageWords(n.mastery)}</span>`;
    return link ? `<a href="${link.path}">${inner}</a>`
                : `<a href="/words" style="opacity:.62">${inner}</a>`;
  }).join('')}</div>`;
  }).join('\n  ')}

  <h2>Then what?</h2>
  <p>If a sound is still missing well past its age, or if people outside your family often can't
     understand your child, that's worth raising with your doctor or a speech-language pathologist.
     Being understood matters much more than any individual sound.</p>
  <p>If everything is on time — which it usually is — practice is still good for it, and it works
     best when it doesn't feel like practice.</p>

  <div class="cta-row">
    <p style="margin-bottom:0">A game your child plays alone. Every line is spoken aloud,
       nothing is scored, and the day ends by itself.</p>
    <a class="cta" href="/words">Say it with me — it's free</a>
  </div>

  <!-- The hub is where a speech-language pathologist most plausibly lands from
       organic search, since these are the queries their own clients arrive
       with. One line, no interruption to the parent reading. -->
  <p style="margin-top:26px;font-size:15px;color:var(--ink-soft)">Are you a speech-language
     pathologist? There's <a href="/for-slps">a page about the home-practice record</a> —
     what's in it, what it refuses to claim, and why it never leaves the family's device.</p>

  <p class="cite"><b>Source.</b> ${esc(CITATION.full)}
     <a href="${CITATION.doi}" rel="nofollow noopener">${CITATION.doi}</a><br>
     Figures are ${CITATION.criterion}. Kide is practice, not therapy, and nothing here diagnoses
     anything.</p>

<script type="module">
import { NORMS, ageWords } from '/engine/norms.js';
const bar = document.getElementById('agebar');
const box = document.getElementById('verdict');
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  [...bar.querySelectorAll('button')].forEach((x) => x.setAttribute('aria-pressed', x === b));
  const m = +b.dataset.m;
  const codes = Object.keys(NORMS);
  const due = codes.filter((c) => NORMS[c].mastery <= m);
  const later = codes.filter((c) => NORMS[c].mastery > m);
  const list = (cs) => [...new Set(cs.map((c) => NORMS[c].letters))].map((l) => '"' + l + '"').join(', ');
  box.hidden = false;
  box.querySelector('p').innerHTML = due.length
    ? '<b>Usually in place by ' + ageWords(m) + ':</b> ' + list(due)
      + (later.length ? '<br><br><b>Still developing — normal to be missing:</b> ' + list(later) : '')
    : '<b>At ' + ageWords(m) + ', every sound is still developing.</b> That is expected: '
      + list(later.slice(0, 8)) + ' and the rest all arrive later.';
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
       'Most English consonants are in place by about 5, but a few of the latest — "r", "th" and '
       + '"zh" — are not expected until 6 or 7. A child still missing those at 5 is typical.'],
      ['My 4-year-old says "wabbit" instead of "rabbit". Is that normal?',
       'Yes. The "r" sound has a 90% mastery age of about 6 years, so substituting "w" at 4 is '
       + 'squarely within the typical range.'],
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
