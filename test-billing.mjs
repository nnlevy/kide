// The money, and the promises it must not break.
//
// 574 assertions covered the engine, the scene, the statistics, the journal,
// the voice and the acquisition surface. None of them covered the first line of
// code on this domain that takes a payment, and a payment surface is exactly
// where this product's defining promise gets broken by accident: someone
// "helpfully" attaches the practice record to a checkout call so the receipt
// can say which child it was for, and nothing visibly changes.
//
// So most of this file is not about billing mechanics. It is about the boundary
// between a child's practice history and the network, and about the two failure
// modes that would only ever surface in production: a hub call made over HTTP
// instead of the service binding (Cloudflare error 1010), and an offering id
// that this repo and riskfreetrial silently stopped agreeing on (a 502 at the
// moment a clinician tried to pay).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};

const worker = readFileSync('src/worker/index.ts', 'utf8');
const page = readFileSync('public/clinician/index.html', 'utf8');
const wrangler = JSON.parse(readFileSync('wrangler.json', 'utf8'));

/* Assertions about *code* run against a comment-stripped copy; assertions about
 * the comments themselves run against the raw file. The distinction matters
 * here: the worker names riskfreetrial.org in prose precisely to warn the next
 * person off calling it, and a naive search would read that warning as the
 * violation it exists to prevent. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const workerCode = stripComments(worker);

/* The clinician page's inline module, which is where every network call on the
 * paid surface lives. Extracted so the assertions below are about shipped
 * behaviour rather than about prose in a comment. */
const pageScript = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || [, ''])[1];

/* Everything the page can put on the wire.
 *
 * The first version of this matched on `fetch(` and was therefore vacuous: the
 * page dispatches through a one-line api() wrapper, so the only literal fetch()
 * in the file is `fetch(path, options)` and every request body was invisible to
 * it. Mutation-testing this suite found it -- a deliberate leak of
 * `record.targets` into an unlock body passed 15/15 green. Match on the request
 * shape instead of on the transport, and assert we found the calls we expect. */
const requestBodies = [...pageScript.matchAll(/body:\s*JSON\.stringify\(([\s\S]*?)\)\s*,?\s*\n/g)]
  .map((m) => m[1]);
const requestUrls = [...pageScript.matchAll(/api\(\s*[`'"]([^`'"]*)[`'"]/g)].map((m) => m[1]);
const wireText = [...requestBodies, ...requestUrls].join('\n');

console.log('\nthe child\'s record never reaches the network');

t('the suite can actually see the requests it claims to police', () => {
  // Guards the failure above: if the page is refactored so these patterns stop
  // matching, this suite must go red rather than quietly stop checking.
  assert(requestBodies.length >= 2,
    `expected to find the unlock and checkout bodies, found ${requestBodies.length}`);
  assert(requestUrls.some((u) => u.includes('entitlement')),
    'the entitlement request URL is no longer visible to this suite');
  assert(requestUrls.some((u) => u.includes('unlock')), 'the unlock request is no longer visible');
  assert(requestUrls.some((u) => u.includes('checkout')), 'the checkout request is no longer visible');
});

t('nothing derived from the record is sent to any endpoint', () => {
  // The exhaustive list of what the paid surface may transmit. If a future
  // change needs to send something else, that is a decision to be argued for
  // in review -- not one that should slip in behind a green test run.
  const ALLOWED = ['email', 'reportRef', 'offeringId', 'fullName'];
  const FORBIDDEN = /\b(record|targets|phoneme|adherence|log|attempts|verdict|journal|childName|firstName|dob|audio|pcm|waveform|embedding|voiceprint|fingerprint)\b/;
  assert(!FORBIDDEN.test(wireText),
    `something derived from the record is on the wire: ${wireText.replace(/\s+/g, ' ').slice(0, 160)}`);
  for (const body of requestBodies) {
    for (const key of body.matchAll(/([A-Za-z_$][\w$]*)\s*[:,}]/g)) {
      assert(ALLOWED.includes(key[1]),
        `unreviewed field "${key[1]}" is being sent to the server`);
    }
  }
});

t('the worker never reads a record field out of a request', () => {
  // The Worker's half of the same boundary. It handles email, an opaque ref and
  // an offering id; if it ever starts destructuring practice data, the record
  // has started crossing the boundary from the other side.
  const forbidden = /body\.(record|log|targets|attempts|adherence|phoneme|childName|firstName|dob)/;
  assert(!forbidden.test(worker), 'the Worker is reading practice data out of a request body');
});

t('the per-report token is random, not derived from the child', () => {
  // reportRef is the one per-report value that reaches the hub, as an
  // idempotency key. Deriving it from the record would turn it into a stable
  // pseudonymous identifier for a child -- which is the category of thing the
  // amended COPPA Rule is about, and precisely what this design avoids.
  assert(/getRandomValues/.test(pageScript), 'reportRef is no longer generated from a CSPRNG');
  const refFor = (pageScript.match(/function refFor[\s\S]*?\n\}/) || [''])[0];
  assert(refFor, 'refFor() has gone');
  assert(!/fingerprint\s*\(/.test(refFor.replace(/refFor\(fp\)/, '')),
    'refFor() now derives the transmitted ref from the record fingerprint');

  // ...and refFor() must be the only thing the transmitted value comes from.
  // Checking the request body alone missed this: the body names a variable, so
  // reassigning that variable to fingerprint(record) leaked the derived value
  // past a green suite. Found by mutation-testing this file.
  const assignments = [...pageScript.matchAll(/\breportRef\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
  assert(assignments.length, 'reportRef is no longer assigned anywhere');
  for (const a of assignments) {
    assert(/^refFor\(/.test(a), `reportRef is assigned from something other than refFor(): ${a}`);
  }
});

t('the fingerprint stays on the device', () => {
  // fingerprint() legitimately reads the record -- it is the local lookup key
  // that stops a reprint being charged twice. It must never be transmitted.
  assert(!/fingerprint/.test(wireText), 'the record fingerprint is being sent to the server');
  assert(/function fingerprint/.test(pageScript), 'fingerprint() has gone; the idempotency key is unanchored');
});

console.log('\nthe hub is reached the one way that works');

t('no code path HTTP-POSTs the billing hub', () => {
  // riskfreetrial.org sits behind bot-fight mode: a Worker-to-Worker HTTP POST
  // at the public hub URL comes back as Cloudflare error 1010, and it comes
  // back that way only in production. The service binding never touches it.
  assert(!/riskfreetrial\.(org|com)/.test(workerCode),
    'the Worker references the hub by URL instead of the service binding');
  assert(!/fetch\(\s*[`'"]https?:\/\//.test(workerCode),
    'the Worker makes an outbound HTTP call; billing must go through the RPC binding');
});

t('every hub call goes through PORTFOLIO_BILLING_SERVICE', () => {
  for (const method of ['createCheckout', 'getCredits', 'consumeCredits']) {
    const re = new RegExp(`\\.${method}\\(`);
    if (!re.test(workerCode)) continue;
    assert(new RegExp(`billing\\??\\.${method}\\(`).test(workerCode),
      `${method}() is called on something other than the billing binding`);
  }
  assert(/env\.PORTFOLIO_BILLING_SERVICE/.test(workerCode), 'the billing binding is no longer read');
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

console.log('\nthe two repos still agree about what is being sold');

t('every offering the worker can request exists in riskfreetrial\'s catalog', () => {
  // The failure this prevents: someone renames an offering in the hub, every
  // test in both repos stays green, and the next clinician to press Buy gets a
  // 502. Skipped rather than failed when the sibling checkout is absent, so
  // this suite still runs on a machine that only has this repo.
  const candidates = ['../riskfreetrial/src/billing.ts',
    ...(existsSync('../.worktrees')
      ? readdirSync('../.worktrees').map((d) => `../.worktrees/${d}/src/billing.ts`)
      : [])].filter((p) => existsSync(p));
  if (!candidates.length) {
    console.log('       (skipped: riskfreetrial checkout not present alongside this repo)');
    return;
  }
  // Any checkout that carries the entry counts: the catalog change ships on a
  // branch first, and this suite has to be honest on a machine where main has
  // not caught up yet.
  const block = candidates
    .map((p) => (readFileSync(p, 'utf8').match(/"kide\.us":\s*\{[\s\S]*?\n  \},/) || [''])[0])
    .find(Boolean);
  assert(block, 'riskfreetrial has no DOMAIN_CATALOG_OVERRIDES entry for kide.us — checkout would 503');

  const ours = [...(worker.match(/const OFFERINGS = new Set\(\[([^\]]*)\]/) || [, ''])[1]
    .matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert(ours.length, 'the worker no longer declares an OFFERINGS set');
  for (const id of ours) {
    assert(block.includes(`"${id}"`), `offering "${id}" is not in riskfreetrial's kide.us catalog`);
  }

  const fallback = (worker.match(/const DEFAULT_OFFERING = "([^"]+)"/) || [])[1];
  assert(ours.includes(fallback), `DEFAULT_OFFERING "${fallback}" is not in OFFERINGS`);
});

t('a caller cannot open checkout for an arbitrary portfolio offering', () => {
  assert(/OFFERINGS\.has\(/.test(worker),
    'the requested offering id is no longer checked against the allow-list');
});

console.log('\nnothing a parent or child touches is behind the paywall');

t('the free report renders without any entitlement', () => {
  // domain-monetize's rule, and the honest one: the free analysis must be
  // genuinely useful. A clinician who is handed a link must be able to read
  // every number in it. Only documentation scaffolding is ever gated.
  const gated = ['proHeader', 'proAppendix'];
  for (const id of ['narrative', 'adherence', 'targets', 'method']) {
    assert(!gated.includes(id), 'a measurement section has been moved behind the paywall');
    assert(page.includes(`id="${id}"`), `the free report lost its #${id} section`);
  }
  const applyPro = (pageScript.match(/function applyPro[\s\S]*?\n\}/) || [''])[0];
  for (const id of ['narrative', 'adherence', 'targets', 'method']) {
    assert(!applyPro.includes(`'${id}'`), `applyPro() is toggling the measurement section #${id}`);
  }
});

t('the paid path degrades to a readable message, never a broken page', () => {
  assert(/Billing is not configured for this deploy/.test(worker),
    'a deploy without the billing binding no longer fails honestly');
  assert(/503/.test(worker), 'billing unavailability no longer returns 503');
});

t('the child is never identified in the professional document', () => {
  // The header asks for the clinician's own chart reference. Asking for a name
  // or a date of birth would put identifiers into a document generated from a
  // child-directed service, which is the thing this whole design avoids.
  assert(/not a full name/i.test(page), 'the chart-reference field lost its warning');
  assert(!/id="fDob"|date of birth[^.]*<input/i.test(page),
    'the professional header is asking for a date of birth');
});

console.log('\nthe paid surface obeys the same child-safety rules as the rest');

t('no ad or analytics tag rode in with the billing code', () => {
  assert(!/adsbygoogle|pagead2\.googlesyndication|ca-pub-|googletagmanager|google-analytics|gtag\(/i.test(page),
    'an ad or analytics tag has appeared on the clinician page');
  assert(!existsSync('public/ads.txt'), 'public/ads.txt is back');
});

t('the ads.txt rationale is still in the worker', () => {
  // It is a comment, so nothing breaks if it is deleted -- which is exactly why
  // it is asserted. It is the only written record of why this domain has no
  // ad inventory, and the next person to "tidy up" the worker will meet it.
  assert(/ads\.txt is deliberately ABSENT/.test(worker),
    'the ads.txt rationale has been removed from src/worker/index.ts');
  assert(/COPPA/.test(worker), 'the COPPA reasoning has been removed from src/worker/index.ts');
});

t('the clinician page is still excluded from search', () => {
  assert(/<meta name="robots" content="noindex,nofollow">/.test(page),
    'the clinician page — which renders a child\'s record — became indexable');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
