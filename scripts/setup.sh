#!/usr/bin/env bash
# Install each app with its own package manager.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="$("$ROOT_DIR/scripts/resolve-pinned-bun.sh")"

echo "==> root + apps/mobile (bun $("$BUN_BIN" --version))"
(cd "$ROOT_DIR" && "$BUN_BIN" install --frozen-lockfile)

if [ -f "$ROOT_DIR/apps/firebase/functions/package.json" ]; then
  echo "==> apps/firebase/functions (npm)"
  (cd "$ROOT_DIR/apps/firebase/functions" && npm ci)
fi
