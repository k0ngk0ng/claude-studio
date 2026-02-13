# ClaudeStudio Server

Auth & sync server for ClaudeStudio desktop app.

## Quick Start (Dev)

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:3456`.

## Deploy (Linux + systemd)

```bash
# Build
cd server
npm install
npm run build

# Deploy (as root)
sudo bash deploy.sh
```

This will:
- Create a `claude-studio` system user
- Install to `/opt/claude-studio-server`
- Store data (SQLite + JWT secret) in `/var/lib/claude-studio`
- Register and start a systemd service

## Manage

```bash
# Status
sudo systemctl status claude-studio-server

# Logs
sudo journalctl -u claude-studio-server -f

# Restart
sudo systemctl restart claude-studio-server

# Stop
sudo systemctl stop claude-studio-server
```

## Update

```bash
cd server
npm run build
sudo bash deploy.sh
```

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Register |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/auth/validate` | Bearer | Validate token |
| POST | `/api/auth/logout` | Bearer | Logout |
| PUT | `/api/auth/profile` | Bearer | Update profile |
| GET | `/api/settings` | Bearer | Get user settings |
| PUT | `/api/settings` | Bearer | Set user setting |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `DATA_DIR` | `~/.claude-studio` | Database & JWT secret location |
