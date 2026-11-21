#!/usr/bin/env bash
# End-to-end patch check, no DSH needed:
# fresh-clone upstream dsh-bots @ f51ca93 -> apply the patch -> node --check
# -> run the bridge declaration validator.
# Usage: bash scripts/verify-patch.sh  (run from the repo root)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
UPSTREAM_COMMIT="c265612a9a09e1b7f26b8e1f145e8da78e0fb471"

git clone -q --depth 1 https://github.com/kadaliao/dsh-bots.git "$WORK/dsh-bots"
cd "$WORK/dsh-bots"
git log --oneline -1
test "$(git rev-parse HEAD)" = "$UPSTREAM_COMMIT" || { echo "upstream HEAD moved from pinned $UPSTREAM_COMMIT" >&2; exit 1; }
git apply --check "$ROOT/patches/dsh-bots-zen-bridge.patch"
git apply "$ROOT/patches/dsh-bots-zen-bridge.patch"
node --check index.js
node "$ROOT/scripts/verify-bridge.mjs" "$WORK/dsh-bots"
echo "verify-patch: OK"
