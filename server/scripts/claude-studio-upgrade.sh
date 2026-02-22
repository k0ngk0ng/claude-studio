#!/usr/bin/env bash
set -euo pipefail

# ClaudeStudio Server — one-click upgrade script
# Usage: sudo bash claude-studio-upgrade.sh
# Place this script anywhere on your server, e.g. /usr/local/bin/claude-studio-upgrade

REPO="k0ngk0ng/claude-studio"
TMP_DIR=$(mktemp -d)
EXTRACT_DIR="$TMP_DIR/claude-studio-server"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> ClaudeStudio Server Upgrade"

# 1. Get latest version
echo "  Checking latest version..."
LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
if [ -z "$LATEST_TAG" ]; then
  echo "Error: Failed to fetch latest release."
  exit 1
fi
echo "  Latest version: $LATEST_TAG"

# 2. Download (tarball filename includes version tag)
TARBALL="$TMP_DIR/claude-studio-server-${LATEST_TAG}.tar.gz"
echo "  Downloading server tarball..."
curl -fSL "https://github.com/$REPO/releases/download/$LATEST_TAG/claude-studio-server-${LATEST_TAG}.tar.gz" -o "$TARBALL"

# 3. Extract
mkdir -p "$EXTRACT_DIR"
tar xzf "$TARBALL" -C "$EXTRACT_DIR"

# 4. Run upgrade
echo "  Running upgrade..."
cd "$EXTRACT_DIR"
bash upgrade.sh

echo ""
echo "==> Upgrade to $LATEST_TAG complete!"
