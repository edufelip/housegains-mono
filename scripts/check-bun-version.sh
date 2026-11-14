#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_BUN_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/.bun-version")"
ACTUAL_BUN_VERSION="${BUN_VERSION_CHECK_ACTUAL:-}"
WORKSPACE_BUN="$ROOT_DIR/.local-bun/bin/bun"
BUN_BIN="${HOUSEGAINS_BUN_BIN:-${BUN_BIN:-}}"

if [[ -z "$BUN_BIN" ]]; then
  if [[ -x "$WORKSPACE_BUN" ]]; then
    BUN_BIN="$WORKSPACE_BUN"
  else
    BUN_BIN="bun"
  fi
fi

if [[ -z "$ACTUAL_BUN_VERSION" ]]; then
  if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
    echo "bun is required. Expected Bun $EXPECTED_BUN_VERSION from $ROOT_DIR/.bun-version." >&2
    exit 1
  fi
  ACTUAL_BUN_VERSION="$("$BUN_BIN" --version)"
fi

if [[ "$ACTUAL_BUN_VERSION" != "$EXPECTED_BUN_VERSION" ]]; then
  echo "Expected Bun $EXPECTED_BUN_VERSION from $ROOT_DIR/.bun-version, got $ACTUAL_BUN_VERSION." >&2
  echo "Install or activate the pinned Bun runtime before running the local HouseGains stack." >&2
  exit 1
fi

echo "Bun $ACTUAL_BUN_VERSION"
