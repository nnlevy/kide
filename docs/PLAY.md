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
