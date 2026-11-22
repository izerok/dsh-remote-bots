#!/usr/bin/env bash
# End-to-end install smoke test for the merged single plugin.
# Creates an isolated DSH_HOME, installs the tarball into the web profile,
# checks the composed config, boots the web profile, and probes the Bots route.
# Usage: bash scripts/smoke-install.sh <path-to-tgz>
# Environment:
#   DSH_VERSION  npm version used when `dsh` is not on PATH (default 0.2.2-rc.5)
#   SMOKE_PORT   override the chosen free port
# Requires: node, pnpm on PATH (CI installs both; a desktop DSH runtime also
# ships pnpm), curl, and either `dsh` on PATH or npx.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: bash scripts/smoke-install.sh <path-to-tgz>" >&2
  exit 2
fi
TGZ="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -f "$TGZ" ]] || { echo "smoke-install: tarball not found: $TGZ" >&2; exit 1; }

DSH_VERSION="${DSH_VERSION:-0.2.2-rc.5}"
command -v node >/dev/null 2>&1 || { echo "smoke-install: node is required" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "smoke-install: curl is required" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || {
  echo "smoke-install: pnpm is required on PATH (the DSH launcher normally supplies one)" >&2
  exit 1
}

if command -v dsh >/dev/null 2>&1; then
  DSH=(dsh)
else
  command -v npx >/dev/null 2>&1 || { echo "smoke-install: dsh or npx is required" >&2; exit 1; }
  DSH=(npx --yes "@deepseek-ai/dsh@${DSH_VERSION}")
fi

PORT="${SMOKE_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}"
DSH_HOME="$(mktemp -d)"
LOG="$DSH_HOME/server.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # A launcher wrapper (npx) can leave the actual server behind; free the port.
  local pids
  pids="$(lsof -ti "tcp:${PORT}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then kill $pids 2>/dev/null || true; fi
  rm -rf "$DSH_HOME"
}
trap cleanup EXIT

export DSH_HOME
cd "$DSH_HOME"

echo "smoke-install: install $TGZ into $DSH_HOME (port ${PORT})"
"${DSH[@]}" plugin --profile web add "$TGZ"

CONFIG="$DSH_HOME/config.yml"
"${DSH[@]}" --profile web --dump-config > "$CONFIG"
if ! grep -q 'id: dsh-remote-bots' "$CONFIG"; then
  echo "smoke-install: composed config does not contain the dsh-remote-bots row" >&2
  grep -n -A4 -B2 'dsh-remote-bots' "$CONFIG" >&2 || true
  exit 1
fi
node -e '
const fs = require("node:fs");
const p = process.env.DSH_HOME + "/profiles/web/node_modules/dsh-remote-bots/package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
if (pkg.name !== "dsh-remote-bots" || typeof pkg.version !== "string") throw new Error("bad installed manifest");
console.log(`smoke-install: installed ${pkg.name}@${pkg.version}`);
'

"${DSH[@]}" --profile web --no-open --host 127.0.0.1 --port "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!

STATE="$DSH_HOME/bots-state.json"
READY=""
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/__dsh_bots/state" -o "$STATE" 2>/dev/null; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "smoke-install: DSH exited before serving the Bots route" >&2
    tail -80 "$LOG" >&2 || true
    exit 1
  fi
  sleep 2
done
if [[ -z "$READY" ]]; then
  echo "smoke-install: timed out waiting for /__dsh_bots/state" >&2
  tail -80 "$LOG" >&2 || true
  exit 1
fi

node -e '
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(state.bots) || state.bots.length === 0) throw new Error("bots route returned no bots");
console.log(`smoke-install: /__dsh_bots/state returned ${state.bots.length} bot(s)`);
' "$STATE"

if ! grep -q 'push_notify tool registered' "$LOG"; then
  echo "smoke-install: zen-remote half did not register its push tool" >&2
  tail -80 "$LOG" >&2 || true
  exit 1
fi

echo "smoke-install: OK"
