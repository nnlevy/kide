// The acquisition surface, and the promises it must not break.
//
// Two thirds of this file is not about ranking. It is about the fact that this
// site is for small children, and that an SEO surface is exactly where a
// child-safety rule gets broken by accident: someone adds an ad tag because
// every other site in the portfolio has one, or drops an analytics snippet on
// a page a child can reach, and nothing visibly changes.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

const { NORMS, CITATION } = await import('./public/engine/norms.js');
const { LEX } = await import('./public/engine/lexicon.js');
const { isMeasured } = await import('./public/engine/measure.js');
const soundDirs = readdirSync('public/sounds', { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);
const read = (p) => readFileSync(p, 'utf8');
const soundPages = soundDirs.map((c) => [c, read(`public/sounds/${c}/index.html`)]);
const allPages = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name));
    else if (e.name === 'index.html') allPages.push([join(dir, e.name), read(join(dir, e.name))]);
  }
})('public');
allPages.push(['index.html', read('index.html')]);

console.log('\nno advertising on a service for small children');

t('there is no ads.txt anywhere', () => {
  // ads.txt declares ad inventory for the domain. kide.us is directed to
  // children of roughly 2-7; under COPPA's amended Rule the persistent
  // identifiers behind targeted advertising are personal information on a
  // child-directed service. It is also flatly incompatible with telling a
  // parent their child's voice never leaves the device.
  assert(!existsSync('public/ads.txt'), 'public/ads.txt is back');
  assert(!existsSync('dist/ads.txt'), 'dist/ads.txt is back');
});

t('no page carries an ad network tag', () => {
  const bad = allPages.filter(([, h]) =>
    /adsbygoogle|pagead2\.googlesyndication|google-adsense-account|ca-pub-/i.test(h));
  assert.equal(bad.length, 0, `ad tag on: ${bad.map(([p]) => p).join(', ')}`);
});

t('no page loads a third-party analytics script', () => {
  // GA4 sets a persistent identifier. On a child-directed service that is the
  // thing COPPA is about. Measurement here is first-party and identifier-free.
  const bad = allPages.filter(([, h]) =>
    /googletagmanager|google-analytics|gtag\(|facebook\.net|hotjar|clarity\.ms/i.test(h));
  assert.equal(bad.length, 0, `third-party analytics on: ${bad.map(([p]) => p).join(', ')}`);
});

console.log('\nchildren are never measured');

t('the measurement allow-list covers parents and excludes children', () => {
  for (const p of ['/', '/sounds', '/sounds/r', '/guides', '/guides/a-slug', '/privacy']) {
    assert(isMeasured(p), `${p} is a parent surface and should be measured`);
  }
  for (const p of ['/words', '/play', '/parent', '/clinician', '/bench', '/words/']) {
    assert(!isMeasured(p), `${p} can be a child's screen and must NOT be measured`);
  }
});

t('the shareable child-facing pages still have social cards', () => {
  // Child-facing means UNMEASURED, not unshareable. /words is the link one
  // parent sends another; stripping its card would cost real distribution for
  // no privacy gain, since a social card contains nothing about anyone.
  for (const p of ['public/words/index.html', 'public/play/index.html']) {
    const h = read(p);
    assert(/property="og:image"/.test(h), `${p} has no social card`);
    assert(!/name="robots"[^>]*noindex/.test(h), `${p} is hidden from search`);
  }
});

t('no beacon is wired into a child-facing page', () => {
  for (const p of ['public/words/index.html', 'public/play/index.html',
                   'public/parent/index.html', 'public/clinician/index.html']) {
    if (!existsSync(p)) continue;
    assert(!/measure\.js/.test(read(p)), `${p} loads the measurement module`);
  }
});

t('measurement sends no identifier that could join two visits', () => {
  const src = read('public/engine/measure.js');
  const body = src.slice(src.indexOf('function send'));
  assert(!/localStorage|sessionStorage|document\.cookie/.test(body),
    'measurement persists something');
  // A random per-session id is what the rest of the portfolio sends. It is
  // still an identifier, and on this domain that is the whole problem.
  assert(!/Math\.random|crypto\.randomUUID/.test(body),
    'measurement mints a session identifier');
});

t('browser-level opt-outs are honoured', () => {
  const src = read('public/engine/measure.js');
  assert(/doNotTrack/.test(src) && /globalPrivacyControl/.test(src),
    'DNT and GPC are not both checked');
});

console.log('\nthe sound pages are built from real data, not invented');

t('every sound page has words behind it', () => {
  // A page for a sound the product cannot practise would be written for a
  // crawler rather than a parent, and would rank for a question it can't answer.
  for (const [code] of soundPages) {
    const n = LEX.filter((w) => w.ph === code).length;
    assert(n > 0, `/sounds/${code} has no words in the lexicon`);
  }
});

t('every word shown on a sound page really carries that sound', () => {
  for (const [code, html] of soundPages) {
    const shown = [...html.matchAll(/<span>([a-z]+)<\/span>/g)].map((m) => m[1]);
    const valid = new Set(LEX.filter((w) => w.ph === code).map((w) => w.w));
    const wrong = shown.filter((w) => !valid.has(w));
    assert.equal(wrong.length, 0, `/sounds/${code} lists ${wrong.join(', ')}`);
  }
});

t('every quoted mastery age matches the norms table', () => {
  for (const [code, html] of soundPages) {
    const years = Math.floor(NORMS[code].mastery / 12);
    assert(html.includes(`${years}`), `/sounds/${code} never states the mastery age`);
    // The page must not claim an age for a DIFFERENT sound's norm.
    const claimed = [...html.matchAll(/by about (\d+)(?: and a half)? years?/g)].map((m) => +m[1]);
    const wrong = claimed.filter((y) => y !== years);
    assert.equal(wrong.length, 0, `/sounds/${code} claims ${wrong.join(',')} but norm is ${years}`);
  }
});

t('every sound page cites the source', () => {
  for (const [code, html] of soundPages) {
    assert(html.includes(CITATION.doi), `/sounds/${code} has no DOI`);
    assert(/McLeod/.test(html), `/sounds/${code} does not name the source`);
  }
});

console.log('\nnothing here overclaims to a parent');

t('no sound page diagnoses, promises or frightens', () => {
  // The brand rule is "no overclaiming to the parent". In this category that
  // is not a style preference -- implying a delay to sell practice is the
  // standard play, and it is the one thing we will not do.
  const banned = /\b(diagnos|cure|treats?\b|treatment|guarantee|fix your child|falling behind|delayed\b)/i;
  for (const [code, html] of soundPages) {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      // The citation block is where the DISCLAIMER lives ("nothing here diagnoses
      // anything"). A crude keyword scan flagged our own negation -- the first
      // version of this test failed on the exact sentence that makes the page
      // safe. The claim block is checked separately, by its own assertion below.
      .replace(/<p class="cite">[\s\S]*?<\/p>/g, '')
      .replace(/<[^>]+>/g, ' ');
    const hit = text.match(banned);
    assert(!hit, `/sounds/${code} says "${hit && hit[0]}"`);
  }
});

t('every sound page says it is practice, not therapy', () => {
  for (const [code, html] of soundPages) {
    assert(/practice, not therapy/i.test(html), `/sounds/${code} omits the disclaimer`);
  }
});

t('the reassurance is the lead, not the footnote', () => {
  // The single differentiating claim: a parent should be able to stop reading
  // after the first screen and feel better. If "on time" appears only at the
  // bottom, we have built the same anxiety funnel as everyone else.
  for (const [code, html] of soundPages) {
    const i = html.indexOf('<h1');
    const j = html.indexOf('<h2');
    const lead = html.slice(i, j > i ? j : i + 1600);
    assert(/on time|not behind|expect/i.test(lead),
      `/sounds/${code} does not reassure above the first subheading`);
  }
});

console.log('\nthe front door reaches everything behind it');

/* An audit found no orphans and still three real holes: the homepage nav
 * omitted Guides, the guides hub had no route from the front door, and the one
 * page aimed at the paying customer was invisible from the homepage. None of
 * that breaks a build or shows up in a link checker — the pages render
 * perfectly and simply never get visited. */

const ADULT_PAGES = allPages.filter(([p]) =>
  p === 'index.html' || /^public\/(sounds|guides|for-slps)\//.test(p) || p === 'public/sounds/index.html');

t('every adult-facing page carries the same three nav links', () => {
  // Three different navs were live at once: the homepage omitted Guides, and
  // /guides called it "Play" pointing at /play while everyone else said
  // "Practise" pointing at /words.
  for (const [p, h] of ADULT_PAGES) {
    const nav = (h.match(/<nav[\s\S]*?<\/nav>/) || [''])[0];
    assert(nav, `${p} has no nav`);
    for (const href of ['/words', '/sounds', '/guides']) {
      assert(nav.includes(`href="${href}"`), `${p} nav is missing ${href}`);
    }
  }
});

t('child-facing surfaces still carry no nav at all', () => {
  // The counterpart rule. /words and /play are played by a two-year-old, and
  // consistency is not a reason to put adult navigation in front of them.
  for (const p of ['public/words/index.html', 'public/play/index.html']) {
    const h = read(p);
    assert(!/<nav[\s>]/.test(h), `${p} has grown a nav — it is a child-facing surface`);
  }
});

t('every public destination is one click from the homepage', () => {
  // Individual sound pages are excepted: they are reached through the /sounds
  // hub by design, and sixteen phoneme links on the homepage would serve the
  // crawler rather than the parent.
  const home = read('index.html');
  const linked = new Set([...home.matchAll(/href="(\/[^"#?]*)"/g)]
    .map((m) => m[1].replace(/\/$/, '') || '/'));
  const xml = read('public/sitemap.xml');
  const routes = [...xml.matchAll(/<loc>https:\/\/kide\.us([^<]*)<\/loc>/g)]
    .map((m) => m[1]).filter((r) => r !== '/' && !/^\/sounds\/./.test(r));
  const missing = routes.filter((r) => !linked.has(r));
  assert.equal(missing.length, 0, `not reachable from the homepage: ${missing.join(', ')}`);
});

t('the page that sells this product links to the evidence for its own headline', () => {
  // The H1 promises screen time that ends without a meltdown. The guide that
  // substantiates that had one inbound link site-wide, from a hub the homepage
  // did not link either.
  const home = read('index.html');
  assert(/href="\/guides\/screen-time-that-ends-itself"/.test(home),
    'the homepage no longer links the guide explaining its own headline');
});

t('one coral call to action on the homepage, as the brand guide requires', () => {
  // docs/BRAND.md: coral is "the one CTA color -- if everything is a CTA,
  // nothing is", and there is one main action per screen. Two coral buttons
  // pointing at two different games was live for a while.
  const home = read('index.html');
  const ctas = [...home.matchAll(/class="cta([^"]*)"/g)].map((m) => m[1].trim());
  assert(ctas.length >= 1, 'the homepage has no call to action at all');
  const primary = ctas.filter((c) => !c.includes('cta-secondary'));
  assert.equal(primary.length, 1,
    `expected exactly one primary (coral) CTA, found ${primary.length}`);
});

console.log('\nthe technical surface is complete');

const PRIVATE_PAGE = /\/(bench|engine|scene|parent|clinician)\//;

t('every public page has a canonical, a description and an og:image', () => {
  for (const [p, h] of allPages) {
    if (PRIVATE_PAGE.test(p)) continue;
    assert(/rel="canonical"/.test(h), `${p} has no canonical`);
    assert(/name="description"/.test(h), `${p} has no meta description`);
    assert(/property="og:image"/.test(h), `${p} has no og:image`);
  }
});

t('every private page tells crawlers to stay out', () => {
  // /parent and /clinician can hold a child's practice record. robots.txt asks
  // politely and the sitemap omits them; the page itself must say so too,
  // because a page reached by a direct link never consults robots.txt.
  for (const [p, h] of allPages) {
    if (!PRIVATE_PAGE.test(p)) continue;
    assert(/name="robots"[^>]*noindex/.test(h), `${p} is indexable`);
  }
});

t('sound pages carry the portfolio @graph plus Article and FAQPage', () => {
  for (const [code, html] of soundPages) {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert(m, `/sounds/${code} has no JSON-LD`);
    const types = JSON.parse(m[1])['@graph'].map((x) => x['@type']);
    for (const want of ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'Article', 'FAQPage']) {
      assert(types.includes(want), `/sounds/${code} missing ${want}`);
    }
  }
});

t('all JSON-LD on the site parses', () => {
  for (const [p, h] of allPages) {
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); }
      catch (e) { assert.fail(`${p}: invalid JSON-LD (${e.message})`); }
    }
  }
});

t('the sitemap lists every public page and no private one', () => {
  const xml = read('public/sitemap.xml');
  const listed = [...xml.matchAll(/<loc>https:\/\/kide\.us([^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const [code] of soundPages) {
    assert(listed.includes(`/sounds/${code}`), `/sounds/${code} missing from sitemap`);
  }
  for (const priv of ['/parent', '/clinician', '/bench', '/engine', '/scene']) {
    assert(!listed.some((l) => l.startsWith(priv)),
      `${priv} is in the sitemap -- it can contain a child's practice record`);
  }
});

t('robots disallows the private surfaces explicitly', () => {
  // Absence from a sitemap is not an instruction. Disallow is.
  const r = read('public/robots.txt');
  for (const priv of ['/parent', '/clinician']) {
    assert(r.includes(`Disallow: ${priv}/`), `robots.txt does not disallow ${priv}`);
  }
  assert(/Sitemap: https:\/\/kide\.us\/sitemap\.xml/.test(r), 'robots.txt has no sitemap line');
});

t('the sitemap is generated, not hand-kept', () => {
  // It drifted once and was missing five live pages by the time anyone looked.
  const gen = read('src/worker/seo-generated.ts');
  assert(/GENERATED/.test(gen), 'seo-generated.ts is not marked generated');
  assert(!/const SITEMAP = `/.test(read('src/worker/index.ts')),
    'a hand-written sitemap is back in the worker');
});

t('the portfolio cross-link is present with attribution', () => {
  const pages = [...soundPages.map(([c]) => `public/sounds/${c}/index.html`), 'public/sounds/index.html'];
  for (const p of pages) {
    assert(/growth\.business\/\?from=kide\.us/.test(read(p)), `${p} has no portfolio footer link`);
  }
});

t('the homepage links into the sound surface', () => {
  const h = read('index.html');
  assert((h.match(/\/sounds/g) || []).length >= 3,
    'the strongest page on the site barely links to the surface built to rank');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
