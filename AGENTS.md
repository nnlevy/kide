# AGENTS.md

## Income first: standing rules from Nir (read before any work)

These rules apply to every AI agent session in this repo (Cursor, Claude Code, Codex, OpenClaw, Copilot, Grok Bot). They come before anything else in this file.

1. **Money path for this repo (kide.us).** Every change must name which link of this chain it moves (visit → tool use → signup → credits / paid step → Stripe revenue or AdSense), and every plan, page, tool, guide, brief and PR opens with this money-path line.
   - **For users:** (parents) ending screen time without a meltdown; (clinicians) chart-ready home-practice records.
   - **For Nir:** the existing $39 one-time Clinician licence (not metered credits); family play is a $15 one-time checkout through that same billing hub, Stripe price `price_1UWqYjIzTeKgjbPrOtu7jVAG` on product `prod_VXwRuRo0HAZXKh`; no ads.txt / AdSense.
   - **Paid paths:** free Pip practice → `https://kide.us/pricing` → `/clinician/` ($39 licence checkout). Family play: free Pip practice → grown-up countdown on `/play` → `/unlock/` → existing `createCheckout` for `family_unlock`.
2. **One income source of truth.** Read the shared income ledger before quoting any traffic or revenue number or proposing work: `/workspace/income/INCOME-SSOT.json` on the Grok Bot box (traffic alias: `/workspace/traffic/TRAFFIC-SSOT.json`; agents without box access ask the Chief of Staff for the current figure). It covers the whole chain: visits (Cloudflare Web Analytics RUM real page loads by source only) → tool uses → signups → credits → Stripe revenue → AdSense. Update it after any measurement (`python3 /workspace/traffic/record.py ...` or `refresh_traffic.py`). Never report Cloudflare zone "unique visitors" as visits (mostly bots). Say "zero Google visits" precisely, never "zero visits". If the entry is older than 36h, re-measure before quoting. Never invent numbers.
3. **Priority order.** Traffic/indexing and new guides → AdSense approval/placement → paid conversion → security only when it leaks money or data, or blocks AdSense.
4. **Dashboard over freebies.** Integrate tools into the logged-in user dashboard with a paid path (existing credits, paid steps, existing Stripe products) instead of shipping standalone free tools. Never create new Stripe products or prices, or change pricing, without Nir. Never expose Nir's private ops dashboard.

_Money path checked against this repo on 2026-11-01. The $39 licence is unchanged. Family play uses Stripe price `price_1UWqYjIzTeKgjbPrOtu7jVAG` ($15 one-time, product `prod_VXwRuRo0HAZXKh`) through the existing hub checkout. The hub catalog still has to list `family_unlock` before that checkout can open. If the path changes, update rule 1 in the same PR._

## Platform gate (required before every PR)
The deploy gate (`nnlevy/scripts` tools/platform-gate, the same `gate.mjs --strict` Ozer's deploy runs) is vendored at
`tools/platform-gate/` (upstream commit in `tools/platform-gate/VERSION`). Do not edit those files; they are re-vendored from upstream.
1. `npm run gate:preflight` — builds, serves `dist/` on http://127.0.0.1:8787, discovers pages, runs the gate, writes
   `gate-preflight-out/gate.json`, exits non-zero on any finding. First run installs Playwright into `tools/platform-gate/runtime`.
   Only some pages: `GATE_PATHS=/,/pricing npm run gate:preflight`. Worker-rendered routes: run `npm run dev` and
   `GATE_URL=http://127.0.0.1:8787 npm run gate:preflight`.
2. Fix until it exits 0 with `failing: 0` (uncited claims, taps<44, text<12px, overflow, axe-critical, CLS, js_error,
   orphan tools, asset HTML fallback). See `tools/platform-gate/README.md`.
3. Paste the full `gate-preflight-out/gate.json` (or its `summary` plus every finding if huge) in the PR body in a ```json block.
No 0-findings JSON in the PR = not ready for review.
