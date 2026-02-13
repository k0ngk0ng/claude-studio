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
- Install config to `/etc/claude-studio/server.env`
- Register and start a systemd service
- Install `cs-admin` CLI to `/usr/local/bin`

## Configuration

Edit `/etc/claude-studio/server.env`:

```env
# Server port
PORT=3456

# Data directory (SQLite database + JWT secret)
DATA_DIR=/var/lib/claude-studio

# Disable new user registration (set to true after creating your accounts)
DISABLE_REGISTRATION=false
```

Restart after changes: `sudo systemctl restart claude-studio-server`

## Manage Service

```bash
sudo systemctl status claude-studio-server
sudo systemctl restart claude-studio-server
sudo systemctl stop claude-studio-server
sudo journalctl -u claude-studio-server -f
```

## Admin CLI

After deploy, use `cs-admin` to manage users:

```bash
cs-admin users                                    # List all users
cs-admin user <email|username>                    # Show user details
cs-admin create <email> <username> <password>     # Create a user
cs-admin delete <email|username>                  # Delete a user
cs-admin reset-password <email|username> <pass>   # Reset password
```

In dev (server directory): `npm run admin -- users`

## Update

从 GitHub Release 下载最新的 server tarball 并更新：

```bash
# 1. 下载并解压新版本
cd /tmp
curl -L https://github.com/k0ngk0ng/claude-studio/releases/latest/download/claude-studio-server.tar.gz -o claude-studio-server.tar.gz
mkdir -p claude-studio-server && tar xzf claude-studio-server.tar.gz -C claude-studio-server

# 2. 更新（只替换代码并重启，不动配置和数据）
cd claude-studio-server
sudo bash upgrade.sh

# 3. 清理
rm -rf /tmp/claude-studio-server /tmp/claude-studio-server.tar.gz
```

`upgrade.sh` 从 `/etc/claude-studio/server.env` 读取配置，只更新应用文件并重启服务。
首次部署请用 `deploy.sh`。

### 修改配置后重新部署

如果修改了 `DATA_DIR` 等路径配置：

```bash
# 1. 编辑配置
sudo vi /etc/claude-studio/server.env

# 2. 重新部署（自动读取新配置，创建目录、更新权限）
sudo bash deploy.sh

# 注意：如果改了 DATA_DIR，旧数据不会自动迁移，需要手动移动：
# sudo mv /var/lib/claude-studio/* /new/data/dir/
```

也可以通过环境变量一次性覆盖（优先级高于 server.env）：

```bash
APP_DIR=/my/app DATA_DIR=/my/data sudo -E bash deploy.sh
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
| `DATA_DIR` | `/var/lib/claude-studio` (deploy) / `~/.claude-studio` (dev) | Database & JWT secret location |
| `DISABLE_REGISTRATION` | `false` | Block new registrations |
