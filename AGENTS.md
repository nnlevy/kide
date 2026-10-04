# AGENTS.md

## Income first: standing rules from Nir (read before any work)

These rules apply to every AI agent session in this repo (Cursor, Claude Code, Codex, OpenClaw, Copilot, Grok Bot). They come before anything else in this file.

1. **Money path for this repo (kide.us).** Every change must name which link of this chain it moves (visit → tool use → signup → credits / paid step → Stripe revenue or AdSense), and every plan, page, tool, guide, brief and PR opens with this money-path line.
   - **For users:** (parents) ending screen time without a meltdown; (clinicians) chart-ready home-practice records.
   - **For Nir:** the existing $39 one-time Clinician licence (not metered credits); no ads.txt / AdSense.
   - **Paid path:** free Pip practice → `https://kide.us/pricing` → `/clinician/` ($39 licence checkout).
2. **One income source of truth.** Read the shared income ledger before quoting any traffic or revenue number or proposing work: `/workspace/income/INCOME-SSOT.json` on the Grok Bot box (traffic alias: `/workspace/traffic/TRAFFIC-SSOT.json`; agents without box access ask the Chief of Staff for the current figure). It covers the whole chain: visits (Cloudflare Web Analytics RUM real page loads by source only) → tool uses → signups → credits → Stripe revenue → AdSense. Update it after any measurement (`python3 /workspace/traffic/record.py ...` or `refresh_traffic.py`). Never report Cloudflare zone "unique visitors" as visits (mostly bots). Say "zero Google visits" precisely, never "zero visits". If the entry is older than 36h, re-measure before quoting. Never invent numbers.
3. **Priority order.** Traffic/indexing and new guides → AdSense approval/placement → paid conversion → security only when it leaks money or data, or blocks AdSense.
4. **Dashboard over freebies.** Integrate tools into the logged-in user dashboard with a paid path (existing credits, paid steps, existing Stripe products) instead of shipping standalone free tools. Never create new Stripe products or prices, or change pricing, without Nir. Never expose Nir's private ops dashboard.

_Money path checked against the live site and this repo on 2026-10-04. If it changes, update rule 1 in the same PR._
