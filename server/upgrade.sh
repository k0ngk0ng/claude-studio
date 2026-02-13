#!/usr/bin/env bash
set -euo pipefail

# ClaudeStudio Server — upgrade script
# Usage: sudo bash upgrade.sh

CONF_DIR="${CONF_DIR:-/etc/claude-studio}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure node is in PATH (sudo may reset PATH)
for p in /usr/local/bin /usr/local/nodejs/bin "$HOME/.nvm/versions/node"/*/bin; do
  [ -d "$p" ] && export PATH="$p:$PATH"
done
if ! command -v node &>/dev/null; then
  echo "Error: node not found. Make sure Node.js is installed and in PATH."
  exit 1
fi

# Load existing config
if [ ! -f "$CONF_DIR/server.env" ]; then
  echo "Error: $CONF_DIR/server.env not found. Run deploy.sh first."
  exit 1
fi

set -a
source "$CONF_DIR/server.env"
set +a

APP_DIR="${APP_DIR:-/opt/claude-studio-server}"
SERVICE_USER="${SERVICE_USER:-claude-studio}"
SERVICE_NAME="${SERVICE_NAME:-claude-studio-server}"

echo "==> ClaudeStudio Server Update"
echo "    APP_DIR:  $APP_DIR"

# 1. Update application files
echo "  Updating $APP_DIR..."
cp -r "$SCRIPT_DIR/dist/" "$APP_DIR/"
cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
cp "$SCRIPT_DIR/admin.mjs" "$APP_DIR/"
cp -r "$SCRIPT_DIR/node_modules" "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# 3. Restart service
echo "  Restarting service..."
systemctl restart "$SERVICE_NAME"
sleep 1

if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo ""
  echo "==> Updated! Service running."
  echo "    Status:  systemctl status $SERVICE_NAME"
  echo "    Logs:    journalctl -u $SERVICE_NAME -f"
else
  echo "==> Service failed to start. Check logs:"
  echo "    journalctl -u $SERVICE_NAME -n 20"
  exit 1
fi
