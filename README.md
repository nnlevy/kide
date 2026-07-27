# kide

Kide.us — a real product, not a placeholder. Pip the Sprout teaches toddlers colors,
counting, shapes, and early screen-time awareness through a joyful, privacy-first game
with no accounts, no ads, and nothing that ever leaves the device. Part of Quizbiz LLC's
domain portfolio.

- `/` — landing page
- `/play` — Pip the Sprout, the game (also live at `quizbiz.org/teachthefuture`)
- `/privacy`, `/terms`
- `docs/BRAND.md` — brand guide (colors, type, mascot, voice) — read before touching any
  copy or UI in this repo
- `docs/PLAY.md` — how the game got here and what `/api/notify` does

`npm run dev` to run locally, `npm run deploy` to ship (guarded by
`scripts/deploy-guard.sh` — dirty or stale trees are refused, see that file's header
for why).
