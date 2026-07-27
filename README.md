# kide

Kide.us — a real product, not a placeholder. Pip the Sprout teaches toddlers colors,
counting, shapes, and early screen-time awareness through a joyful, privacy-first game
with no accounts, no ads, and nothing that ever leaves the device. Pip reads every
question out loud, so a child who can't read yet can play unaided. Part of Quizbiz LLC's
domain portfolio.

- `/` — landing page
- `/play` — Pip the Sprout, the game (also live at `quizbiz.org/teachthefuture`)
- `/privacy`, `/terms`
- `docs/BRAND.md` — brand guide (colors, type, mascot, voice) — read before touching any
  copy or UI in this repo
- `docs/PLAY.md` — how the game got here and what `/api/notify` does
- `docs/VOICE.md` — how Pip speaks and listens, and why the microphone policy is what it
  is — read before changing anything under `public/voice*` or `tools/voice/`
- `public/voice.js` + `public/voice/v1/` — the voice layer: a zero-dependency module and
  a pre-rendered neural voice pack. Portable to any other domain in the portfolio.
- `tools/voice/` — the pack generator (`npm run voice:render`); not needed to build or
  deploy, only to change what Pip says or how he sounds

`npm run dev` to run locally, `npm run test:voice` to run the 41-assertion voice suite in
a real browser, `npm run deploy` to ship (guarded by
`scripts/deploy-guard.sh` — dirty or stale trees are refused, see that file's header
for why).
