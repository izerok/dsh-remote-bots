#!/usr/bin/env bash
# LEGACY: install the two upstream plugins separately.
# The recommended path is the single merged package from Releases:
#   dsh plugin --profile web add /path/to/dsh-remote-bots-<version>.tgz
# Install dsh-bots + dsh-zen-remote into the DSH `web` profile.
# Only runs the two install commands documented in the two upstreams' READMEs.
# Pinned versions expected (checked afterwards from the profile if present):
#   dsh-zen-remote 2.5.4, @kadaliao/dsh-bots 0.17.0, DSH 0.2.x.
# This script does NOT apply the bridge patch; see docs/bridge.md for that.
set -euo pipefail

command -v dsh >/dev/null 2>&1 || { echo "dsh not found in PATH; install DeepSeek Harness first." >&2; exit 1; }

dsh plugin --profile web add dsh-zen-remote
dsh plugin --profile web add @kadaliao/dsh-bots

echo "Installed. Check versions in ~/.dsh/profiles/web/package.json:"
grep -E '"(dsh-zen-remote|@kadaliao/dsh-bots)"' ~/.dsh/profiles/web/package.json || true
echo "Next: open DSH, hire a team in Bots, then share the bot sessions you want remote (see README.md)."
