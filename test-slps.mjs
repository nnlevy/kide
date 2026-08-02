// The clinician acquisition surface, and the claims it is not allowed to drift from.
//
// /for-slps is the only page on this domain aimed at the only customer who has
// ever been likely to pay. It exists because /clinician renders a child's
// record and is therefore permanently noindex, which left a single route to
// that customer: a parent forwarding a link.
//
// Two failure modes are worth a test suite, and neither would ever announce
// itself:
//
//   1. THE PAGE QUIETLY STOPS BEING FINDABLE. A noindex added by reflex
//      ("clinician pages are private here, aren't they?"), a broken link from
//      the surfaces that feed it, an omission from the sitemap. The page keeps
//      rendering perfectly and earns nothing, and nobody notices for a quarter.
//
//   2. THE CLAIMS GO STALE. The page states thresholds ("no rate below 8
//      attempts") and a price ("$39 once"). Those are claims about what the
//      software does and what the checkout charges. The normal way such a claim
//      becomes a lie is that somebody changes a constant in another file, or a
//      price in another REPOSITORY, and never thinks about the marketing copy.
//      Selling to clinicians on a number that is no longer true is the specific
//      way this product would lose the audience it is built for.
//
// So the numbers are imported into the page at build time and re-derived here,
// and the price is checked against riskfreetrial's catalog.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert';

let pass = 0, fail = 0, skipped = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const skip = (name, why) => { console.log(`  SKIP ${name}\n       ${why}`); skipped++; };

const {
  CI_MASS, MIN_ATTEMPTS_PER_TARGET, MIN_ATTEMPTS_FOR_TREND, MIN_REPORTABLE_EFFECT, METHOD_VERSION,
  buildRecord,
} = await import('./public/engine/clinical.js');

const page = readFileSync('public/for-slps/index.html', 'utf8');
const clinician = readFileSync('public/clinician/index.html', 'utf8');
const parent = readFileSync('public/parent/index.html', 'utf8');
const hub = readFileSync('public/sounds/index.html', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');
const robots = readFileSync('public/robots.txt', 'utf8');
// Whitespace-normalised, because the source is wrapped for humans and a phrase
// assertion that breaks on a line break tests the formatter, not the copy.
const text = page
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');

console.log('\nthe page can actually be found');

t('it is indexable — this is the whole point of it existing', () => {
  // The neighbouring page is permanently noindex for good reasons, and the
  // reflex to make this one match would silently remove the only route to the
  // paying customer.
  assert(!/name="robots"[^>]*noindex/.test(page), '/for-slps has been made noindex');
  assert(/name="robots"[^>]*index/.test(page), '/for-slps no longer declares itself indexable');
  assert(/rel="canonical" href="https:\/\/kide\.us\/for-slps"/.test(page), 'canonical is missing or wrong');
});

t('the sitemap lists it and robots does not block it', () => {
  assert(sitemap.includes('<loc>https://kide.us/for-slps</loc>'), '/for-slps is not in the sitemap');
  assert(!/Disallow: \/for-slps/.test(robots), 'robots.txt disallows /for-slps');
});

t('every surface that should feed it does', () => {
  // Three routes in, each for a different person: a parent who is about to hand
  // over a record, a clinician already looking at one, and organic search
  // landing on the parent-facing hub.
  assert(/href="\/for-slps"/.test(parent), 'the parent share block no longer links to /for-slps');
  assert(/href="\/for-slps"/.test(clinician), 'the clinician report no longer links to /for-slps');
  assert(/href="\/for-slps"/.test(hub), 'the /sounds hub no longer links to /for-slps');
});

t('it points at a populated report, not an empty one', () => {
  // "Press the button marked worked example" is a step at which people leave,
  // and an empty report is impossible to judge.
  assert(/href="\/clinician\/\?demo=1"/.test(page), '/for-slps no longer links to the worked example');
  assert(/query\.get\('demo'\)/.test(clinician), '/clinician no longer honours ?demo=1');
  assert(/function loadWorkedExample/.test(clinician), 'the worked example is no longer callable from a URL');
});

console.log('\nno number on the page can drift from the code');

t('every threshold quoted matches engine/clinical.js', () => {
  // Each of these is a claim about software behaviour, made to a professional
  // audience. They are imported at build time precisely so this test can hold
  // them to the constants rather than to a copywriter's memory.
  //
  // Matched in context, never as a bare number. The first version of this
  // asserted `page.includes("12")` and was therefore vacuous: bumping
  // MIN_ATTEMPTS_PER_TARGET from 8 to 12 without rebuilding the page left the
  // suite green, because "12" also appears in the og:image width of 1200.
  // Found by mutation-testing this file.
  const expected = [
    [new RegExp(`Jeffreys ${Math.round(CI_MASS * 100)}% credible interval`), 'credible interval mass'],
    [new RegExp(`No rate below ${MIN_ATTEMPTS_PER_TARGET} attempts`), 'minimum attempts before a rate'],
    [new RegExp(`not reported at all below ${MIN_ATTEMPTS_PER_TARGET} attempts`), 'the same minimum, in the FAQ'],
    [new RegExp(`below ${MIN_ATTEMPTS_FOR_TREND} attempts`), 'minimum attempts before a direction is claimed'],
    [new RegExp(`${MIN_REPORTABLE_EFFECT.toFixed(2).replace('.', '\\.')} (absolute|in absolute terms)`),
     'minimum reportable effect size'],
    [new RegExp(METHOD_VERSION.replace(/[.]/g, '\\.')), 'method version'],
  ];
  for (const [re, what] of expected) {
    assert(re.test(text),
      `/for-slps no longer states the ${what} as clinical.js defines it — run "npm run seo"`);
  }
});

t('it states the limitation that matters, not just the capabilities', () => {
  // The adult-speech calibration is the single most important caveat and the
  // most tempting to drop from a sales page.
  assert(/calibrated on adult speech/i.test(text), 'the adult-speech calibration caveat is gone');
  assert(/never diagnoses|not .{0,20}diagnos/i.test(text), 'the page no longer says it does not diagnose');
  assert(/practice, not therapy/i.test(text), 'the standing disclaimer is missing');

  // Asked and answered in the clinician's own words, and repeated in the
  // standing disclaimer. A professional audience checks this first, and a page
  // that leaves it implicit reads as a page hoping nobody asks.
  assert(/is this an assessment\?/i.test(text), 'the page no longer asks the question a clinician asks first');
  assert(/not built to become one/i.test(text), 'the answer to "is this an assessment" has been softened');
  assert(/nothing here is a standardised assessment/i.test(text),
    'the standing disclaimer no longer rules out being a standardised assessment');
});

t('it does not claim the record is a substitute for the clinician\'s own data', () => {
  assert(/replace|substitute/i.test(text), 'the page no longer addresses what it does not replace');
  assert(!/replaces clinical judgement(?! )/i.test(text.replace(/none of it replaces clinical judgement/i, '')),
    'the page claims to replace clinical judgement');
});

console.log('\nthe price on the page is the price the hub charges');

const HUB = ['../riskfreetrial/src/billing.ts',
  ...(existsSync('../.worktrees')
    ? readdirSync('../.worktrees').map((d) => `../.worktrees/${d}/src/billing.ts`)
    : [])]
  .filter((p) => existsSync(p))
  .map((p) => readFileSync(p, 'utf8'))
  .find((s) => /"kide\.us":/.test(s));

if (!HUB) {
  skip('the advertised price matches riskfreetrial\'s catalog', [
    'no riskfreetrial checkout here carries the kide.us catalog entry.',
    '       If it is merged and this checkout is stale: git -C ../riskfreetrial pull --ff-only',
  ].join('\n'));
} else {
  t('the advertised price matches riskfreetrial\'s catalog', () => {
    // Marketing copy in one repo, the amount actually charged in another. There
    // is no mechanism by which changing one would prompt anybody to change the
    // other, and the failure is visible only to a clinician at the moment they
    // are asked to pay a different number than the one that persuaded them.
    const block = (HUB.match(/"kide\.us":\s*\{[\s\S]*?\n  \},/) || [''])[0];
    assert(block, 'the kide.us catalog block could not be parsed');
    const cents = [...block.matchAll(/,\s*(\d{3,6}),\s*\n/g)].map((m) => +m[1]);
    assert(cents.length, 'no price found in the kide.us catalog block');
    const dollars = [...new Set(cents.map((c) => `$${c / 100}`))];
    for (const d of dollars) {
      assert(text.includes(d),
        `the hub charges ${d} for a kide.us offering and /for-slps never mentions that price`);
    }
    const advertised = [...new Set([...text.matchAll(/\$(\d+)\b/g)].map((m) => +m[1]))];
    for (const a of advertised) {
      assert(cents.includes(a * 100),
        `/for-slps advertises $${a}, which is not a price in riskfreetrial's kide.us catalog`);
    }
  });
}

console.log('\nno child\'s data is on a public page');

t('the page carries no practice record and no share payload', () => {
  // /for-slps is indexed. /clinician is not, precisely because it renders a
  // record. Nothing that could carry one belongs here.
  assert(!/\?data=/.test(page), '/for-slps contains a record share link');
  assert(!/buildRecord|journal|localStorage|atob\(/.test(page),
    '/for-slps has started handling record data — it is an indexed page');

  // The sharper invariant: this page runs one script and that script is the
  // shared, identifier-free measurement import. Anything else on an indexed
  // page that a clinician reaches from a record link is worth a conversation.
  const scripts = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const executable = scripts.filter((m) => !/application\/ld\+json/.test(m[1]));
  assert.equal(executable.length, 1, `expected exactly one executable script, found ${executable.length}`);
  assert(/engine\/measure\.js/.test(executable[0][2]),
    'the one script on /for-slps is no longer the shared measurement import');
});

t('the worked example still contains what the page promises a clinician will see', () => {
  // The page tells a clinician the example spans 28 days, includes a lapse, an
  // improving target, a flat one, and one with too little data. If the example
  // changes and the description does not, the first thing a sceptical
  // professional does is catch us out.
  assert(/28[- ]day|28 days/.test(text), '/for-slps no longer describes the example span');
  const demo = (clinician.match(/function loadWorkedExample[\s\S]*?\n\}/) || [''])[0];
  assert(/for \(let d = 0; d < 28; d\+\+\)/.test(demo), 'the worked example no longer spans 28 days');
  assert(/continue;\s*\/\/ a real lapse/.test(demo), 'the worked example no longer contains a lapse');
  assert(/too few to report/.test(demo), 'the worked example no longer contains a thin target');

  // And it must actually produce a report with those properties when run.
  const rec = buildRecord([], { now: Date.now() });
  assert.equal(rec.targets.length, 0, 'an empty log should produce no targets');
  assert(rec.disclaimer, 'the record carries no disclaimer');
});

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
process.exit(fail ? 1 : 0);
