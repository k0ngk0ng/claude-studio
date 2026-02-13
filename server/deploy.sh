#!/usr/bin/env bash
set -euo pipefail

# ClaudeStudio Server — deploy / update script
# Usage: sudo bash deploy.sh

APP_DIR="/opt/claude-studio-server"
DATA_DIR="/var/lib/claude-studio"
CONF_DIR="/etc/claude-studio"
SERVICE_USER="claude-studio"
SERVICE_NAME="claude-studio-server"

echo "==> ClaudeStudio Server Deploy"

# 1. Create system user if not exists
if ! id "$SERVICE_USER" &>/dev/null; then
  echo "  Creating user $SERVICE_USER..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# 2. Create data directory
echo "  Setting up data directory..."
mkdir -p "$DATA_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# 3. Install config (don't overwrite existing)
echo "  Setting up config..."
mkdir -p "$CONF_DIR"
if [ ! -f "$CONF_DIR/server.env" ]; then
  cp .env.example "$CONF_DIR/server.env"
  chmod 640 "$CONF_DIR/server.env"
  chown root:"$SERVICE_USER" "$CONF_DIR/server.env"
  echo "  Created $CONF_DIR/server.env (edit as needed)"
else
  echo "  Config exists, skipping (edit $CONF_DIR/server.env to change)"
fi

# 4. Copy application files
echo "  Installing to $APP_DIR..."
mkdir -p "$APP_DIR"
cp -r dist/ "$APP_DIR/"
cp package.json "$APP_DIR/"
cp admin.mjs "$APP_DIR/"

# 5. Install production dependencies
echo "  Installing dependencies..."
cd "$APP_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts 2>/dev/null
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# 6. Install systemd service
echo "  Installing systemd service..."
cp "$OLDPWD/claude-studio-server.service" /etc/systemd/system/"$SERVICE_NAME".service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# 7. Restart service
echo "  Starting service..."
systemctl restart "$SERVICE_NAME"
sleep 1

if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo ""
  echo "==> Done! Server running on port 3456"
  echo "    Config:  $CONF_DIR/server.env"
  echo "    Data:    $DATA_DIR"
  echo "    Status:  systemctl status $SERVICE_NAME"
  echo "    Logs:    journalctl -u $SERVICE_NAME -f"
else
  echo "==> Service failed to start. Check logs:"
  echo "    journalctl -u $SERVICE_NAME -n 20"
  exit 1
fi
