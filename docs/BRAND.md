# Kide brand guide

v1 · 2026-07-27 · source of truth for anything under the Kide brand. The interactive
version (with a live-rendered Pip) was delivered directly to Nir; this file is the
diffable, repo-native copy — extend it before improvising around it.

## Who this is for

Kide is the home for everything Quizbiz LLC makes for little kids and their parents —
starting with Pip's learning games, growing into more activities, tools and guides over
time. Every product under this roof shares this system, so a parent who trusts one thing
on Kide can trust the next.

## Logo

The wordmark is always lowercase — `kide`, never `Kide` or `KIDE` — as a logotype. In
running text, capitalize it normally: "Kide is...". The icon mark is Pip's face; use it
alone only when space is tight (app icons, favicons, small nav marks) — never invent a
second icon.

## Color

Grass green is Pip's color and the brand's primary. Coral is the *one* action color — if
everything is a CTA, nothing is. Dusk and Night exist only for the wind-down /
end-of-session moment; they never appear on ordinary marketing or product screens.

| Name | Hex | Use |
|---|---|---|
| Grass | `#6FD08C` / `#4FB874` | Primary brand color — Pip, heading accents |
| Coral | `#FF8A73` / `#F16E55` | The one CTA color — use sparingly |
| Sky | `#56C6E6` → `#BDEBFF` | Default daytime background |
| Sun | `#FFD166` / `#FFC94A` | Warmth, highlights, streak progress |
| Berry | `#FF8FA8` / `#FF6F9C` | Blush, playful accents |
| Sand (blue) | `#4EA8DE` / `#3B8FC4` | Secondary buttons, water/sky objects |
| Grape | `#B497D6` / `#9C7BC7` | Tertiary accent, variety in game content |
| Pumpkin | `#FF9F5B` / `#F2843A` | Tertiary accent, variety in game content |
| Dusk | `#3C5A8A` → `#7C8FC9` | Session winding down — nowhere else |
| Night | `#232B4D` → `#3A3E72` | Goodbye / end-of-session screen only |
| Cream | `#FFFBF2` | Page background, neutral |
| Ink | `#2E3A3F` | Body text — never pure black |

## Typography

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif`.
No webfont downloads — faster, offline-safe, and San Francisco Rounded at large sizes
already reads warm and friendly. Weight does the work: headlines are extra-bold (800),
body copy is regular, nothing in between.

- H1 — 800 — clamp(28–56px)
- H2 — 800 — 22–28px
- Body — 400 — 16–19px
- Eyebrow / label — 700 — 12–14px, uppercase, letter-spacing .06em

## Mascot — Pip the Sprout

Pip is Kide's guide — a small sprout who is always learning too. Gentle, patient,
endlessly encouraging, a little sleepy by nature. Pip never rushes a child and never
runs out of patience. Drawn entirely in CSS/SVG (no image files) so he's crisp at any
size and instant to load — see `.pip-*` classes, reused verbatim across the game,
landing page, and this guide.

**Traits:** patient, curious, encouraging, gentle, a little sleepy, never in a hurry.

**States:** Happy (default — playing, greeting, waiting) · Sleepy (session winding
down — never scared, just cozy) · Celebrating (correct answers, milestones — more
leaves as mastery grows).

**Never:** scared, sad, scolding, rushed, competitive, or drawn in a photo/illustration
style that clashes with the flat rounded-shape system. Pip has no gender, no age beyond
"little," no species more specific than "sprout" — keep him simple so every child can
see themselves in him.

## Voice & tone

Write like you're kneeling down to talk to a three-year-old, then handing the parent
next to them a straight answer with no hype. Short sentences. No jargon in front of the
child. No overclaiming to the parent — if something isn't built yet, say so.

| Don't | Do |
|---|---|
| Leverage our proprietary AI-powered adaptive learning engine to unlock your child's potential. | Pip notices what your child is ready for next — no accounts, no data leaving the device. |
| Oops! Wrong answer! Try harder! | Let's look again! |
| Time's up. Session locked. | Pip is getting sleepy… should we tuck Pip in? |

## Applied

Buttons: pill-shaped, bold, drop-shadow "pressed" look. `btn-primary` (coral) for the
one main action per screen, `btn-secondary` (sand blue) for a secondary action,
`btn-ghost` (white, outlined) for cancel/dismiss. Cards: white, rounded (20–28px radius),
soft shadow, never sharp corners — nothing in this system is sharp.
