#!/usr/bin/env bash
# Release gate for the merged single plugin.
# Usage: bash scripts/verify-release.sh [tag]
#   tag  optional; when given it must be exactly v<plugin/package.json version>.
# Runs: client rebuild drift check -> syntax checks -> static validator ->
#       npm pack -> required-file assertions on the tarball.
# No DSH, no network beyond the local npm binary.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-}"
VERSION="$(node -e "console.log(JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version)" "$ROOT/plugin/package.json")"
EXPECTED_TAG="v${VERSION}"

if [[ -n "$TAG" && "$TAG" != "$EXPECTED_TAG" ]]; then
  echo "verify-release: tag ${TAG} does not match plugin version ${VERSION} (expected ${EXPECTED_TAG})" >&2
  exit 1
fi
echo "verify-release: dsh-remote-bots ${VERSION}${TAG:+ (${TAG})}"

cd "$ROOT"

# The committed client bundle must be reproducible from the vendored halves.
node scripts/build-plugin-client.mjs
if [[ -d "$ROOT/.git" ]]; then
  if ! git diff --exit-code -- plugin/client.js; then
    echo "verify-release: plugin/client.js is stale; commit the regenerated bundle" >&2
    exit 1
  fi
else
  echo "verify-release: not a git checkout, skipping client drift diff"
fi

node --check plugin/index.js
node --check plugin/client.js
node scripts/verify-plugin.mjs

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
(
  cd "$ROOT/plugin"
  npm pack --silent --pack-destination "$WORK" >/dev/null
)
TGZ="$WORK/dsh-remote-bots-${VERSION}.tgz"
if [[ ! -f "$TGZ" ]]; then
  echo "verify-release: npm pack did not produce dsh-remote-bots-${VERSION}.tgz" >&2
  ls -l "$WORK" >&2
  exit 1
fi

LIST="$WORK/files.txt"
tar -tzf "$TGZ" > "$LIST"
required=(
  package/package.json
  package/index.js
  package/client.js
  package/cordis.patch.yml
  package/icon.svg
  package/VENDORING.md
  package/LICENSES/dsh-bots-MIT.txt
  package/LICENSES/dsh-zen-remote-MIT.txt
  package/src/bots/index.js
  package/src/zen-remote/lib/index.js
)
for path in "${required[@]}"; do
  if ! grep -qx "$path" "$LIST"; then
    echo "verify-release: tarball is missing ${path}" >&2
    exit 1
  fi
done
if grep -q '^package/node_modules/' "$LIST"; then
  echo "verify-release: tarball unexpectedly contains node_modules" >&2
  exit 1
fi

SIZE="$(wc -c < "$TGZ" | tr -d ' ')"
COUNT="$(wc -l < "$LIST" | tr -d ' ')"
echo "verify-release: packed ${TGZ##*/} — ${COUNT} entries, ${SIZE} bytes"
echo "verify-release: OK"
