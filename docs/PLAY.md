# Pip's game on kide.us

`/play` is [Pip the Sprout](./BRAND.md), the toddler learning game originally built for
`quizbiz.org/teachthefuture`. Same file, ported here as Kide's flagship — and first —
piece of real content.

## Why one mascot, not two

Kide had no brand and no content before this. Rather than invent a second character,
Pip *became* Kide's mascot. One character, drawn once, reused everywhere is simpler to
maintain and more recognizable than splitting attention across two. `quizbiz.org/teachthefuture`
and `kide.us/play` now run the same game file with only branding/endpoint differences —
see the diff between the two `index.html` files if the two ever need to diverge.

## What changed porting it here

- Canonical URL, page title, and JSON-LD `publisher` now point at Kide instead of TeachTheFuture/Quizbiz.
- The Parent Corner "notify me about new concept packs" form now posts to `/api/notify`
  (this repo's own KV-backed endpoint) instead of quizbiz's `/api/leads`.
- Footer credit reads "part of Kide, by Quizbiz LLC" and links home.
- Everything else — the game logic, the adaptive-streak system, the local-only storage,
  the screen-time-awareness goodbye flow — is untouched.

## `/api/notify`

`POST /api/notify` with `{ email, name?, need?, matchedDomain?, matchedTitle?, pageUrl? }`.
Validates the email, stores one record per address in the `KIDE_LEADS` KV namespace
(`lead:<email>` → JSON, overwritten on resubmit so the list stays deduped), returns
`{ ok: true }`. No cookies, no third-party processor, no D1 — KV is the whole backend for now.
The existing `DB` (shared `domains-db`) binding is untouched and unused by this route.

Used by both the landing page's "more coming soon" signup and the in-game Parent Corner
form, so a parent can sign up from either surface.

## Static asset routing

`src/worker/index.ts` tries `env.ASSETS.fetch()` first for anything that isn't `/ads.txt`,
`/sitemap.xml`, `/robots.txt`, or a `POST /api/notify` — so `/play`, `/privacy`, `/terms`,
and `/` are served straight from `dist/` (built from `public/` + root `index.html` by
`npm run build`) with no per-route code needed. Add a new static page by dropping
`public/<path>/index.html` in and it's live at `/<path>` on the next deploy.

## Pip's Turn (added 2026-07-27)

`/play` now carries two pretend-play routines alongside the three quiz games —
**Going Potty** and **Washing Hands**. They deliberately share no mechanics with
the quiz: no score, no streak, no tier, no timer, no wrong tap, no fail state.
The child helps Pip; the child is never the one being tested.

Read [HABITS.md](./HABITS.md) before touching them. The short version of why
they are built this way:

- Material rewards measurably *reduce* toddlers' spontaneous helping (53% of
  trials after a reward, vs 89% with none), so the leaf/streak engine must not
  be extended to habit or character content.
- Children under about three transfer poorly from screen to life, so the screen
  rehearses and primes; the habit itself happens in the bathroom.
- Performance pressure around elimination is the causal path to withholding,
  which ~24% of children go through. Scoring a child's poop is not neutral.

Content lives in `R_POTTY_OPEN` / `R_POTTY_SIT` / `R_WENT` / `R_NONE` / `R_ACC` /
`R_WASH` and is assembled by `ROUTINES[key].build(outcome)`. Endings follow a
fixed 10-run rotation (`R_OUTCOMES`) rather than a coin flip, so every child
meets all three — success, nothing-happened, and an accident — within a handful
of plays, and the very first run is always the whole happy sequence.

`npm run test:routines` drives the real UI through every branch. Several of its
assertions are negative on purpose (no mastery dots, no scoring vocabulary,
no change to `totalCorrect`) — those are the ones that will catch a future
change quietly turning this back into a game.
