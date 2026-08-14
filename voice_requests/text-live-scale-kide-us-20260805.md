=== AUTONOMY DIRECTIVE (read first — owner standing order 2026-07-17) ===
You are running unattended. NO ONE reads or answers questions in this session. NEVER end a reply asking for confirmation, a decision, 'PROCEED', or missing details — that burns the attempt and churns the claim (observed: items looped to 250+ attempts this way). Instead: make the reasonable choice yourself, record it in the receipt under DECISIONS:, and continue. Need an input you can discover (domain list, file path, current state)? Discover it (repo scan, state files, live probe). Truly blocked on owner-only resources (secrets, spend, console access)? Write the exact obstruction to state/obstructions/<claim_id>.md and transition to blocked — one attempt, clean exit, never a question.
DEPENDENCY RULE: The DEPENDENCY GATE block in this prompt is the ONLY authority on deps. If it says CLEARED, you MUST implement — frozen DEPENDS_ON / Dependency-gated behind lines are historical.

SUPERVISOR CLAIM text-live-scale-kide-us-20260805
DOMAIN=kide.us
REPO=/Users/nirlevy/.openclaw/workspace/kide
TYPE=experience_contract_audit LANE=product-polish
MODEL=xai/grok-build-0.1 TASK_TYPE=review TIER=s_trusted
EXECUTION_CONTRACT={"definition_of_done":{"shape":"cubic_dual_cover","implement_complete":true,"verify_all_pass":true,"close_complete":true,"live_target":"https://kide.us/","summary":"Observed journey failures repaired or explicitly evidenced as absent; structured browser proof, screenshots, receipt, and portfolio-exec completion recorded."},"verification_steps":["Generate and validate state/domain_experience_contracts/kide.us.json","Run node tools/domain_experience_browser_verify.mjs kide.us state/browser_verification","Record desktop and mobile screenshot conclusions independently from DOM checks","Run python3 tools/founder_path_qa.py --domain kide.us --json --no-receipt","Require all structured browser journey_assertions true and record a structurally VERIFIED experience contract; never override browser ok=false with receipt prose","Write a live receipt and close with portfolio-exec complete"],"quality_gates":["primary_action","expected_route_or_outcome","input_context_preservation","example_user_separation","first_use_jargon","concrete_process_copy","responsive_visual_proof","attachment_coverage","structured_journey_evidence"],"auto_deploy":true,"cdc_ports":{"implement":["Exercise this domain's own primary product journey on mobile and desktop using the structured experience contract.","Repair only observed failures in this domain's brand and product model;"],"verify":["Generate and validate state/domain_experience_contracts/kide.us.json","Run node tools/domain_experience_browser_verify.mjs kide.us state/browser_verification","Record desktop and mobile screenshot conclusions independently from DOM checks","Run python3 tools/founder_path_qa.py --domain kide.us --json --no-receipt","Require all structured browser journey_assertions true and record a structurally VERIFIED experience contract; never override browser ok=false with receipt prose","Write a live receipt and close with portfolio-exec complete","After deploy: re-poll live endpoint until expected schema keys appear (version/domain/etc) or fail","Assert response JSON keys from definition_of_done \u2014 not only HTTP status","Record deploy version id + sample JSON keys in receipt"],"close":["portfolio-exec complete --id text-live-scale-kide-us-20260805 --notes '\u226540 chars + live proof'","Write state/receipts/<date>-<domain>-<slug>.md naming conflict_key + evidence","Heartbeat was current; no open depends_on_conflict_keys"]},"dual_cover":{"implement_cycle":["Exercise this domain's own primary product journey on mobile and desktop using the structured experience contract.","Repair only observed failures in this domain's brand and product model;"],"verify_cycle":["Generate and validate state/domain_experience_contracts/kide.us.json","Run node tools/domain_experience_browser_verify.mjs kide.us state/browser_verification","Record desktop and mobile screenshot conclusions independently from DOM checks","Run python3 tools/founder_path_qa.py --domain kide.us --json --no-receipt","Require all structured browser journey_assertions true and record a structurally VERIFIED experience contract; never override browser ok=false with receipt prose","Write a live receipt and close with portfolio-exec complete","After deploy: re-poll live endpoint until expected schema keys appear (version/domain/etc) or fail","Assert response JSON keys from definition_of_done \u2014 not only HTTP status","Record deploy version id + sample JSON keys in receipt"],"note":"Every deliverable edge must appear in BOTH cycles. Implement alone is an uncovered bridge \u2014 not done."},"obstruction_checks":["open_depends_on_conflict_keys","missing_live_or_test_evidence","missing_receipt_path","completion_notes_under_40_chars","seed_template_without_SHIPPED_line","empty_pr_or_zero_addition_diff","live_smoke_without_http_status"],"auto_decisions":[{"id":"cdc_cubic_ports","decision":"Every queue item is cubic: implement|verify|close ports via portfolio_cdc_work_unit; wall-of-text alone is invalid shape","source":"platform_lessons_cdc"},{"id":"cdc_dual_cover","decision":"Done requires dual cover: implement cycle AND independent verify cycle; implement alone is claim theater","source":"platform_lessons_cdc"},{"id":"cdc_dual_obstruction","decision":"Complete rejects when dual obstructions remain (open deps, thin notes, no receipt, empty PR, seed template)","source":"platform_lessons_cdc"},{"id":"cdc_series_parallel","decision":"Series only on depends_on_conflict_keys; parallel only distinct conflict_keys/domains under domain mutex","source":"platform_lessons_cdc"},{"id":"adsense_monitor_thrash","decision":"AdSense monitor re-enqueues same 4 domains every ~15m; 200+ cancelled items. Enqueue must dedup by open conflict_key; supersede, never stack.","source":"platform_lessons_cdc"},{"id":"amber_remote","decision":"amber/red \u2192 remote-dispatch Grok GHA not local thrash","source":"platform_lessons_cdc"},{"id":"audit_package_sequenced_dag","decision":"External audits ingest to state/domain_audits/<domain>/<date>/ with executive_brief + implementation_manifest, then sequenced product_ship queue items with conflict_keys and depends_on \u2014 never a single thin research stub","source":"platform_lessons_cdc"},{"id":"billing_service_binding","decision":"Use PORTFOLIO_BILLING_SERVICE not hub HTTP for leaf checkout","source":"platform_lessons_cdc"},{"id":"complete_live_verify","decision":"Queue done requires live HTTP/API verify + receipt","source":"platform_lessons_cdc"},{"id":"completion_policy_ssot_20260719","decision":"Completion SSOT: merge/deploy is progress; product done only with live surface proof + portfolio-exec complete (docs/COMPLETION_POLICY.md).","source":"platform_lessons_cdc"},{"id":"diagnosis_no_credit_satellite","decision":"Bill-diagnosis and household utility tools: no credits, referral rewards, or Impact Game satellite language. Share-for-artifact only (pattern viral-share-result-loop).","source":"platform_lessons_cdc"},{"id":"false_403_not_code","decision":"Transient CF 403 is not a code bug. Re-probe live before blocking; if all routes 200 with real HTML bytes, complete or requeue \u2014 do not thrash implement.","source":"platform_lessons_cdc"},{"id":"focused_session_beats_queue_thrash","decision":"Flagship/first-cut product: prefer sequential must_local epic with live surface proof over remote parallel product_ship thrash. Platform optimizes breadth/WIP unlock; quality needs one vertical path. See docs/WHY_FOCUSED","source":"platform_lessons_cdc"},{"id":"growth_done_forensic_gate","decision":"Do not mark viral/share product_ship done on API-only plan-share. Forensic: primary analyze/tool path shows card; live share URL 200 + personalized OG; convert event wired. Run portfolio_growth_forensic when conflict_key","source":"platform_lessons_cdc"},{"id":"keepawake_control_plane","decision":"Control plane must not rely on open TUI apps for sleep prevention. Keep LaunchAgent caffeinate (portfolio-keepawake) + Energy prevent-sleep on AC.","source":"platform_lessons_cdc"},{"id":"never_wait_tech","decision":"Auto-decide pure tech; owner only for real secrets","source":"platform_lessons_cdc"},{"id":"owner_class_blocker_optional","decision":"Owner dashboard cards use owner_class blocker|decision|verify|optional. Sort blocker first; only blocker sets blocks_agents. Phone smoke/optional never block agents; do not default all cards to priority 97 bottleneck.","source":"platform_lessons_cdc"},{"id":"prod_learn_complete_rejected","decision":"Production: complete_rejected on product \u2014 free WIP to ready; finish with real live smoke, never raw status=done.","source":"platform_lessons_cdc"}],"conflict_key":"experience-v2:kide.us","depends_on_conflict_keys":[],"depends_on_live":"CLEARED"}

=== DEPENDENCY GATE — LIVE STATE (authoritative; generated at spawn) ===
The kernel dependency gate is the ONLY authority on whether this unit may run.
Any `Dependency-gated behind: ...` / DEPENDS_ON / depends_on_conflict_keys text
in notes/CDC/EXECUTION_CONTRACT above is HISTORICAL and frozen at enqueue time.
Those lines are NOT instructions to stop when STATUS below is CLEARED.

STATUS: CLEARED — every declared dependency is satisfied (done/cancelled or missing).
Satisfied: text-live-scale-visualtos-com-20260805 [done], text-live-scale-doting-co-20260805 [done], text-live-scale-checkinforwork-com-20260805 [done]

Do NOT refuse with "dependency-gated behind X" or "open_depends_on_conflict_keys".
If X appears in frozen notes above, X is already done. PROCEED TO IMPLEMENT.
=== CDC WORK UNIT (cubic dual-cover — required) ===
shape=cubic family=experience_contract_audit conflict_key=experience-v2:kide.us
domain=kide.us id=text-live-scale-kide-us-20260805
Theory: every deliverable edge is covered EXACTLY TWICE — implement cycle + independent verify cycle. Close only when dual obstructions vanish.

PORT 1 — IMPLEMENT (first cover):
  1. Exercise this domain's own primary product journey on mobile and desktop using the structured experience contract.
  2. Repair only observed failures in this domain's brand and product model;

PORT 2 — VERIFY (second cover — independent; do not skip):
  1. Generate and validate state/domain_experience_contracts/kide.us.json
  2. Run node tools/domain_experience_browser_verify.mjs kide.us state/browser_verification
  3. Record desktop and mobile screenshot conclusions independently from DOM checks
  4. Run python3 tools/founder_path_qa.py --domain kide.us --json --no-receipt
  5. Require all structured browser journey_assertions true and record a structurally VERIFIED experience contract; never override browser ok=false with receipt prose
  6. Write a live receipt and close with portfolio-exec complete
  7. After deploy: re-poll live endpoint until expected schema keys appear (version/domain/etc) or fail

PORT 3 — CLOSE (vertex that only fires when ports 1+2 pass):
  1. portfolio-exec complete --id text-live-scale-kide-us-20260805 --notes '≥40 chars + live proof'
  2. Write state/receipts/<date>-<domain>-<slug>.md naming conflict_key + evidence
  3. Heartbeat was current; no open depends_on_conflict_keys

DEFINITION_OF_DONE: Observed journey failures repaired or explicitly evidenced as absent; structured browser proof, screenshots, receipt, and portfolio-exec completion recorded.
DEPENDS_ON LIVE: [] — CLEARED. Historical list below is NOT a stop signal.
DEPENDS_ON HISTORICAL (satisfied): ['experience-v2:visualtos.com', 'experience-v2:doting.co', 'experience-v2:checkinforwork.com']
DUAL_OBSTRUCTIONS (all must vanish before done):
  1. missing_live_or_test_evidence
  2. missing_receipt_path
  3. completion_notes_under_40_chars
  4. seed_template_without_SHIPPED_line
  5. empty_pr_or_zero_addition_diff
  6. live_smoke_without_http_status
CONSTRAINTS:
  1. No paid promotion, outreach, payment changes, or unrelated redesign
AUTO_DECISIONS (do not wait on owner for these):
  1. Every q
…[cdc truncated]

BOUNDED IMPLEMENT PORTS:
- Exercise this domain's own primary product journey on mobile and desktop using the structured experience contract.
- Repair only observed failures in this domain's brand and product model;

FULL DIRECTIVE (context only — do not widen past ports):
Exercise this domain's own primary product journey on mobile and desktop using the structured experience contract. Repair only observed failures in this domain's brand and product model; do not copy Partimepreneur language or design. No paid promotion, outreach, payment changes, or unrelated redesign.

Implement only this bounded cubic unit in this repo. Run EVERY verify-cycle step (second cover). If a quality gate or dual obstruction remains after allowed attempts, block with exact evidence; do not widen scope. Deploy only when auto_deploy is true and the portfolio deploy controller is green.
=== COMPLETION CONTRACT (required — domains platform loop) ===
Work is NOT done until dual obstructions vanish AND you close the claim:
A) Preferred: portfolio-exec complete --id text-live-scale-kide-us-20260805 --notes 'what shipped (files+live proof)'
B) Or APPEND to voice_requests/text-live-scale-kide-us-20260805.md a completion block AFTER work ships:
    (1) a whole line whose only content is: PORTFOLIO_COMPLETE <claim_id>
    (2) a whole line: SHIPPED: <what changed, commit or live URL, tests>
    Seed/instruction text alone is NEVER completion (do not mark done until SHIPPED exists).
C) Or write a receipt under ~/.openclaw/workspace/state/receipts/ that mentions text-live-scale-kide-us-20260805 AND ship evidence
While working, heartbeat every ~15m: portfolio-exec heartbeat --id text-live-scale-kide-us-20260805
No heartbeat for 20m → claim released (nowhere-zero flow: idle claimed = released).
AdSense-ready = live ads.txt+sitemap+content/delight+home 200 — NOT only dist/ads.txt thrash.
If you need Nir (AdSense console, secrets, brand), block with owner_steps (desk-only).
Quality-gated stages must finish with portfolio-exec complete --receipt <existing path> --notes '<at least 40 chars covering checks and evidence>'.
Use only the model selected by policy. Economy stages use the fast non-reasoning route; security, money, migration, and release stages require their declared trusted review gate.
=== SPAWN RULES (state/spawn_rules.json — single source) ===
NEVER: pipe gate exit codes; delete content outside scope; touch payments/DNS/secrets; ship placeholders or fake content (real data, real screenshots, or honest labels); markdown-wrap completion markers; redefine a domain's homepage identity (hero h1 / title / logo — state/homepage_identity.json) without HOMEPAGE-CHANGE-APPROVED in the commit message (amend the designed home, never replace it). ALWAYS: capture true exit codes; bump BUILD_DATE where required; build before wrangler deploy; verify visual changes with an actual screenshot; forward-only migrations; camelCase + exact enums on og APIs.
=== SHIP GATE (enforced in portfolio-exec complete) ===
Repo-bound claims cannot close on prose. 'done per contract' without product is rejected. Your completion notes/receipt MUST contain one of: a PR URL (github.com/.../pull/N), 'merged to main', deploy + live HTTP 200 evidence, or 'no changes required' + verification receipt. Opening the PR and verifying live IS part of your claim scope — never defer it to 'a later platform step'.
