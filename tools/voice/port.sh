#!/usr/bin/env bash
# Port Pip's voice layer to the twin deployment at quizbiz.org/teachthefuture.
#
# The two sites run the same game file and differ only by nine branding
# substitutions, so this is deterministic rather than a merge: take kide's
# game verbatim, rewrite the branding, copy the module and the voice pack.
#
#   tools/voice/port.sh ~/.openclaw/workspace/quizbiz
#
# Run from a real terminal — the device-bridge sandbox has no network and
# cannot complete a git commit. Review `git diff` in the target before shipping.
set -euo pipefail

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: tools/voice/port.sh <path-to-quizbiz-repo>"; exit 1; }
[ -d "$TARGET/public/teachthefuture" ] || { echo "no public/teachthefuture in $TARGET"; exit 1; }

SRC="$(cd "$(dirname "$0")/../.." && pwd)"
GAME="$TARGET/public/teachthefuture/index.html"

if ! git -C "$TARGET" diff --quiet || ! git -C "$TARGET" diff --cached --quiet; then
  echo "! $TARGET has uncommitted changes."
  echo "  Commit or stash them first — this overwrites the game file wholesale."
  exit 1
fi

echo "→ module and voice pack"
mkdir -p "$TARGET/public/voice"
cp "$SRC/public/voice.js" "$TARGET/public/voice.js"
rm -rf "$TARGET/public/voice/v1"
cp -r "$SRC/public/voice/v1" "$TARGET/public/voice/v1"

echo "→ game file, with branding rewritten"
sed \
  -e 's#Grow \&amp; Learn | Kide#Grow \&amp; Learn | TeachTheFuture#' \
  -e 's#https://kide.us/play#https://quizbiz.org/teachthefuture#' \
  -e 's#Pip the Sprout — Kide#Pip the Sprout — TeachTheFuture#' \
  -e 's#PIP THE SPROUT — Kide#PIP THE SPROUT — TeachTheFuture#' \
  -e 's#Pip the Sprout is part of <a href="/">Kide</a>, by Quizbiz LLC.#Pip the Sprout is made by Quizbiz LLC.#' \
  -e 's#"/api/notify"#"/api/leads"#' \
  -e 's#"Kide parent"#"TeachTheFuture parent"#' \
  -e 's#matchedDomain: "kide"#matchedDomain: "teachthefuture"#' \
  -e 's#matchedTitle: "Kide — Pip the Sprout"#matchedTitle: "TeachTheFuture — Pip the Sprout"#' \
  "$SRC/public/play/index.html" > "$GAME"

echo
echo "Copied. Two things left, by hand:"
echo "  1. src/index.js — serve /voice/* with 'Cache-Control: public, max-age=31536000, immutable'"
echo "     (see the equivalent block in kide's src/worker/index.ts)"
echo "  2. Add the microphone + voice sections to that site's privacy policy and terms"
echo "     (copy from kide's public/privacy/index.html — the claims must match what ships)"
echo
echo "Then: git -C $TARGET add -A && git -C $TARGET commit && deploy."
