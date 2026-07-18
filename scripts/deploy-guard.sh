#!/bin/bash
# In-repo deploy guard (2026-07-18): npm run deploy refuses dirty/stale trees.
# Live was clobbered on 2026-07-18 by a deploy from a dirty checkout 15 commits
# behind main. origin/main is the only source of truth. FORCE_DEPLOY=1 overrides.
set -euo pipefail
[ "${FORCE_DEPLOY:-0}" = "1" ] && { echo "!!! FORCE_DEPLOY override — guard bypassed"; exit 0; }
git fetch --quiet origin 2>/dev/null || echo "WARN: fetch failed; using last-known origin refs"
if [ -n "$(git status --porcelain)" ]; then
  echo "DEPLOY BLOCKED: dirty tree — commit to a branch or stash. Uncommitted work never deploys." >&2; exit 2
fi
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$BEHIND" -gt 0 ]; then
  echo "DEPLOY BLOCKED: HEAD is $BEHIND commit(s) behind origin/main — pull first. Stale deploys overwrite newer live work." >&2; exit 2
fi
