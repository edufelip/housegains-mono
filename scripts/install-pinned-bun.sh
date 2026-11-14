#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_BUN_VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/.bun-version")"
INSTALL_ROOT="$ROOT_DIR/.local-bun"
VERSION_DIR="$INSTALL_ROOT/bun-v$EXPECTED_BUN_VERSION"
BIN_DIR="$INSTALL_ROOT/bin"
TARGET_BIN="$BIN_DIR/bun"
DRY_RUN=false

usage() {
  cat <<'USAGE'
Usage: scripts/install-pinned-bun.sh [--dry-run]

Installs the workspace-pinned Bun runtime into .local-bun/ without changing
the user's global Bun installation.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

platform="$(uname -s)"
arch="$(uname -m)"

case "$platform" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) echo "Unsupported platform for Bun install: $platform" >&2; exit 1 ;;
esac

case "$arch" in
  arm64|aarch64) cpu="aarch64" ;;
  x86_64|amd64) cpu="x64" ;;
  *) echo "Unsupported CPU architecture for Bun install: $arch" >&2; exit 1 ;;
esac

asset="bun-$os-$cpu"
url="https://github.com/oven-sh/bun/releases/download/bun-v$EXPECTED_BUN_VERSION/$asset.zip"

if [[ "$DRY_RUN" == true ]]; then
  cat <<DRYRUN
Would install Bun $EXPECTED_BUN_VERSION:
  release: bun-v$EXPECTED_BUN_VERSION
  asset: $asset.zip
  url: $url
  target: $TARGET_BIN
DRYRUN
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download Bun $EXPECTED_BUN_VERSION." >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to extract Bun $EXPECTED_BUN_VERSION." >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/housegains-bun-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

zip_file="$tmp_dir/$asset.zip"
curl -fL "$url" -o "$zip_file"
unzip -q "$zip_file" -d "$tmp_dir"

downloaded_bun="$tmp_dir/$asset/bun"
if [[ ! -x "$downloaded_bun" ]]; then
  echo "Downloaded archive did not contain expected Bun binary: $asset/bun" >&2
  exit 1
fi

downloaded_version="$("$downloaded_bun" --version)"
if [[ "$downloaded_version" != "$EXPECTED_BUN_VERSION" ]]; then
  echo "Downloaded Bun version mismatch: expected $EXPECTED_BUN_VERSION, got $downloaded_version." >&2
  exit 1
fi

mkdir -p "$VERSION_DIR" "$BIN_DIR"
cp "$downloaded_bun" "$VERSION_DIR/bun"
chmod +x "$VERSION_DIR/bun"
ln -sfn "../bun-v$EXPECTED_BUN_VERSION/bun" "$TARGET_BIN"

echo "Installed Bun $EXPECTED_BUN_VERSION at $TARGET_BIN"
