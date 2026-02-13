#!/usr/bin/env bash
set -euo pipefail

# ClaudeStudio Server — deploy / update script
# Usage: sudo bash deploy.sh
# All paths can be overridden via environment variables:
#   APP_DIR=/my/app DATA_DIR=/my/data sudo -E bash deploy.sh

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

# Load existing config if present (so re-runs pick up changes to server.env)
if [ -f "$CONF_DIR/server.env" ]; then
  echo "  Loading existing config from $CONF_DIR/server.env"
  set -a
  source "$CONF_DIR/server.env"
  set +a
fi

# Env vars > server.env > defaults
APP_DIR="${APP_DIR:-/opt/claude-studio-server}"
DATA_DIR="${DATA_DIR:-/var/lib/claude-studio}"
SERVICE_USER="${SERVICE_USER:-claude-studio}"
SERVICE_NAME="${SERVICE_NAME:-claude-studio-server}"

echo "==> ClaudeStudio Server Deploy"
echo "    APP_DIR:  $APP_DIR"
echo "    DATA_DIR: $DATA_DIR"
echo "    CONF_DIR: $CONF_DIR"

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
  cp "$SCRIPT_DIR/.env.example" "$CONF_DIR/server.env"
  chmod 640 "$CONF_DIR/server.env"
  chown root:"$SERVICE_USER" "$CONF_DIR/server.env"
  echo "  Created $CONF_DIR/server.env (edit as needed)"
else
  echo "  Config exists, skipping (edit $CONF_DIR/server.env to change)"
fi

# 4. Copy application files
echo "  Installing to $APP_DIR..."
mkdir -p "$APP_DIR"
cp -r "$SCRIPT_DIR/dist/" "$APP_DIR/"
cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
cp "$SCRIPT_DIR/admin.mjs" "$APP_DIR/"
cp -r "$SCRIPT_DIR/node_modules" "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# 6. Create admin CLI symlink
echo "  Setting up admin CLI..."
ln -sf "$APP_DIR/admin.mjs" /usr/local/bin/claude-studio-admin
# Wrapper so DATA_DIR is always set
cat > /usr/local/bin/cs-admin <<WRAPPER
#!/usr/bin/env bash
# Load config from server.env if not already set
if [ -f ${CONF_DIR}/server.env ]; then
  source ${CONF_DIR}/server.env
fi
export DATA_DIR="\${DATA_DIR:-${DATA_DIR}}"
exec node ${APP_DIR}/admin.mjs "\$@"
WRAPPER
chmod +x /usr/local/bin/cs-admin

# 7. Install systemd service
echo "  Installing systemd service..."
cp "$SCRIPT_DIR/claude-studio-server.service" /etc/systemd/system/"$SERVICE_NAME".service
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
