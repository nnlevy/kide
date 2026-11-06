# Platform pre-ship gate (shared)

One gate for every domain repo. Read-only: GET loads only, never submits, never deploys.

```
node tools/platform-gate/gate.mjs https://site/ [more urls] --out DIR [--strict]
     [--mobile-devices a,b] [--no-mobile] [--require-metadata] [--check-sources] [--claims-json page.json]
node --test tools/platform-gate/test/*.test.mjs# unit tests (no browser, fetch mocked)
```
Needs `playwright` (+ optional `@axe-core/playwright`) resolvable from the caller.

## Checks
1. **Mobile (strict, MOBILE-SPEC.md)** — `mobile-strict.mjs`, 15 profiles: tap targets ≥44×44, visible text ≥12px,
   no horizontal overflow (incl. 200% text profiles), axe critical, CLS ≤0.1, HTTP <400, h1/main present.
   **Nested scroll** (phone profiles, `nested-scroll.mjs`): fails a page whose primary content sits in an inner
   vertical scroll box (overflow-y auto/scroll with a max/fixed height, ≥120px tall, ≥60% wide, ≥280 chars or
   headings/articles) inside the page scroll. One page scroll only on phones. Ignored: fixed/sticky overlays, nav/header/
   footer/aside, dialogs, menus, listboxes, tables, code, form fields, and `[data-scroll-ok]` (reviewed opt-out).
   Ratchet check name: `mobile:nested-scroll`. Tests: `test/nested-scroll.test.mjs`.
2. **Claims / citations** — `claims.mjs` + in-page `extract-blocks.js`. A claim = figure (counts, %, currency, units such as
   gallons/GPUs), ranking, legal rule, or present-tense status ("is live", "available in"). Each needs a citation inside its
   paragraph/card: external `<a>`, `<cite>`, footnote ref, or `data-source`. Nav/header/footer ignored.
   - `--require-metadata`: claim also needs `source_url`, `as_of`, `recheck_by`, `tier` (markup `data-source`,
     `data-as-of`, `data-recheck-by`, `data-tier`, or a per-page claims JSON). Fails past `recheck_by` and
     `recheck_by` beyond tier max: status/news/conflict/memorial 7d · price/rate 30d · law/standard 180d · constant 365d.
   - `--check-sources`: `data-source-quote` / `data-source-hash` must still match the fetched source.
   - Every claim is tagged `tier_suggested` and `escalation` (money / memorial / political / medical-legal).

## Which pages are checked
`platform-gate-check.sh` asks `discover-pages.mjs` for the page list. Precedence: `PLATFORM_GATE_PATHS` >
`state/platform-gate-keyurls/<domain>` > **discovery**. Discovery reads `/sitemap.xml` (nested sitemap indexes followed,
max 10 files) plus every same-origin `<a href>` on the home page (static HTML; one headless render only if the HTML has
none), dedupes by path, puts `/` first and caps at **40** pages (cap is logged). No sitemap and no links = discovery
FAILS and the gate blocks (`DISCOVERY FAILED: ...`). Pages are audited one after another in one browser.
```
node tools/platform-gate/discover-pages.mjs https://site/ --domain site.com [--keyurls FILE] [--cap 40] [--json]
```

## Exemptions (per domain, `config/domains.json`)
`ownPrices` (e.g. `$29` on watershortcut, exempt anywhere on the site), `ownSkus`, `ownPricePaths` (prices inside links/buttons
pointing to own `/buy`, `/credits`, `/pricing`, checkout, Stripe… are exempt; all text on those pages is exempt),
`allowPatterns` (regex), `allowPages`. Built-in: dates, phone, zip, UI numbers (step 1/2, question 3/10, ©year).
Factual figures always need a source.

Never a citation: links (or `data-source`) to the site itself or any of Nir's portfolio domains (`_portfolio.portfolioDomains`
in config + every configured domain). Only third-party sources count. Elements inside `[data-demo]` or `.example-data` are skipped
(demo/sample dashboards). `ownPrices` match whitespace/line-break-insensitively.

## Estimate marker (calculator outputs)
An element with `data-estimate`, the visible label "Your estimate" and `data-estimate-inputs="id1 id2"` (every input feeding the formula) has its numbers skipped only when every listed input is cited (external link, `<cite>`, footnote ref, or non-own `data-source` on the input, its `<label>`, `aria-describedby` target or enclosing `p/li/td/dd/fieldset`). Unmarked, no inputs listed, a missing id, or any uncited input: flagged. Component: `estimate-kit/` (shared). Tests: `test/estimate-marker.test.mjs`.

## Own-price marker
Currency amounts inside an element carrying `data-own-price` (or its descendants) are exempt from the uncited-claims check. Only currency amounts are exempt: any other number inside the marker (counts, percents) is still a claim. Class names (price/plan/card) are never used to infer this. Paragraphs longer than 1500 chars are chunked, never skipped.

## Billing-provider text
`billing-provider.mjs`: fails a page whose VISIBLE text (`document.body.innerText`) names one of the portfolio domains (`portfolioDomains`, bare name or full domain) as billing/credits provider, e.g. "billing via riskfreetrial". href/attributes are never inspected, so linking to riskfreetrial.org with neutral text passes.

## Daily live mobile check

`node tools/platform-gate/daily-mobile.mjs [--workspace ~/.openclaw/workspace] [--registry domains.json] [--out DIR]`

Runs `mobile-strict.mjs` (15 profiles) on every live site. The site list is never hand-kept: it is the Cloudflare
registry (`state/live/cf/domains.json` on the `live-truth` branch: active zones with a Worker route or custom domain)
unioned with the routes in each repo's wrangler config (wrangler.json > wrangler.jsonc > wrangler.toml). A site fails
unless all 15 profiles ran and passed: unreachable sites, crashes, timeouts, partial reports, unreadable configs and a
missing/not-ok registry all count as failures. `--list` prints the resolved site list.
## Orphan tools (`orphan_tools`)
`orphan-tools.mjs`: on the home URL (`/`), every LIVE tool route (GET < 400) must have at least one inbound link from the
rendered home DOM (which includes nav/header/footer; SPA homes are rendered by Playwright). Tool routes =
`_toolRoutes[<domain>]` in `config/domains.json` plus any `sitemap.xml` path matching `_toolRoutes._patterns`.
A tool route with zero inbound links is an `orphan_tools` finding and fails the gate (`--strict`; deploy wrapper blocks, no baseline).
Tests: `test/orphan-tools.test.mjs`.

## Asset HTML fallback (`asset_html_fallback`)
`asset-html.mjs`: on the home URL (`/`), GETs the known asset paths (`/sw.js`, `/manifest.json`, `/manifest.webmanifest`,
`/site.webmanifest`) plus every same-site `<script src>` and `<link rel=manifest href>` from the rendered home DOM whose path ends
in `.js`, `.json` or `.webmanifest`. Any response with `Content-Type: text/html` (200 SPA fallback or an HTML 404 page) is an
`asset_html_fallback` finding and fails the gate (deploy wrapper blocks, no baseline). A 404 with a non-HTML type passes.
`--no-asset-html` skips. Tests: `test/asset-html.test.mjs`.

## Subpage ratchet (baseline that only shrinks)

`baseline/subpages.json` lists each live site's known subpage failures (page → check → count, e.g.
`"/savings-plan": {"mobile:taps<44": 3}`), recorded from a full 15-profile rescan, with a per-site
`remove_by` date (worst sites earliest). `ratchet.mjs verdict` (called by `~/.openclaw/bin/platform-gate-check.sh`)
blocks a deploy when:

- a page has a failure not in the baseline, or a baselined count got worse (a passing page regressing is the same thing);
- the deploy edits a baselined page (git diff from `.wrangler/last-deploy.json` sha: a changed file that maps to
  the route, or a changed line naming the route) and that page still has its baselined failure;
- any first-party `js_error`, orphan tool, or asset HTML fallback (never baselined);
- anything fails on the home page or a `state/platform-gate-keyurls/<domain>` page (always strict);
- the site's `remove_by` date has passed (the entry stops counting).

When a baselined failure now passes, the gate writes the shrunk entry to
`~/.openclaw/state/platform-gate-ratchet/<domain>.json` and logs `SHRUNK`; the effective baseline is committed ∩ overlay.
Fold overlays into the committed file with a PR. `test/ratchet.test.mjs` fails CI when the committed file gains a site,
page or check, raises a count, or moves a date later than on `origin/main`.
`baseline-count.mjs` prints what is left per site (posted daily 7 AM ET to COS_OPS by
`~/.openclaw/workspace/tools/platform_gate_baseline_board.py`).
