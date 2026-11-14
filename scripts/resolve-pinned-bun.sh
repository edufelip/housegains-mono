#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_BUN_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/.bun-version")"
WORKSPACE_BUN="$ROOT_DIR/.local-bun/bin/bun"

version_for() {
  local candidate="$1"
  "$candidate" --version 2>/dev/null || true
}

accept_or_explain() {
  local candidate="$1"
  local source="$2"

  if [[ ! -x "$candidate" ]]; then
    echo "$source Bun binary is not executable: $candidate" >&2
    return 1
  fi

  local actual
  actual="$(version_for "$candidate")"
  if [[ "$actual" == "$EXPECTED_BUN_VERSION" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  echo "Expected Bun $EXPECTED_BUN_VERSION from $ROOT_DIR/.bun-version, got ${actual:-unknown} at $candidate." >&2
  return 1
}

if [[ -n "${HOUSEGAINS_BUN_BIN:-}" ]]; then
  accept_or_explain "$HOUSEGAINS_BUN_BIN" "HOUSEGAINS_BUN_BIN"
  exit $?
fi

if [[ -x "$WORKSPACE_BUN" ]]; then
  accept_or_explain "$WORKSPACE_BUN" "workspace-local"
  exit $?
fi

if command -v bun >/dev/null 2>&1; then
  candidate="$(command -v bun)"
  actual="$(version_for "$candidate")"
  if [[ "$actual" == "$EXPECTED_BUN_VERSION" ]]; then
    printf '%s\n' "$candidate"
    exit 0
  fi
  echo "Expected Bun $EXPECTED_BUN_VERSION from $ROOT_DIR/.bun-version, got ${actual:-unknown} at $candidate." >&2
else
  echo "bun is not available on PATH." >&2
fi

echo "Install the pinned workspace-local Bun with: bash scripts/install-pinned-bun.sh" >&2
exit 1
