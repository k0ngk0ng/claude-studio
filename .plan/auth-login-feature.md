# 用户登录功能实现方案

## 概述

为 ClaudeStudio 添加用户账号系统。初期使用 SQLite 作为本地服务端存储，后续可扩展为远程服务。登录按钮放在 TopBar 右上角（Commit 按钮和分隔线之间）。

---

## 架构设计

```
新增文件:
src/
├── main/
│   ├── auth-server.ts          # 内嵌 HTTP 服务 (Electron main process 内)
│   ├── auth-db.ts              # SQLite 数据库操作层
│   └── auth-ipc-handlers.ts    # Auth 相关 IPC handlers
├── preload/
│   └── preload.ts              # 新增 window.api.auth 命名空间
└── renderer/
    ├── types/index.ts           # 新增 AuthAPI, User 等类型
    ├── stores/authStore.ts      # 用户认证状态管理
    └── components/
        ├── TopBar/UserButton.tsx # 右上角用户按钮 (头像/登录)
        └── Auth/
            ├── LoginModal.tsx    # 登录/注册弹窗
            └── UserMenu.tsx      # 已登录用户下拉菜单
```

---

## 第一阶段：核心实现

### 1. 数据库层 (`src/main/auth-db.ts`)

使用 `better-sqlite3`（同步 API，Electron 友好，无需 native rebuild 问题少）。

数据库文件位置：`~/.claude-studio/auth.db`

表结构：

```sql
-- 用户表
CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- UUID
  email       TEXT UNIQUE NOT NULL,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,           -- bcrypt hash
  avatar_url  TEXT,
  created_at  INTEGER NOT NULL,        -- Unix timestamp
  updated_at  INTEGER NOT NULL
);

-- 会话令牌表
CREATE TABLE auth_tokens (
  token       TEXT PRIMARY KEY,        -- 随机 token
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,        -- Unix timestamp
  created_at  INTEGER NOT NULL
);

-- 用户配置表 (为后续同步准备)
CREATE TABLE user_settings (
  user_id     TEXT NOT NULL REFERENCES users(id),
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,           -- JSON string
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- 用户 sessions 同步表 (为后续准备，初期可不填充)
CREATE TABLE user_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  project_path TEXT NOT NULL,
  title       TEXT,
  session_data TEXT,                   -- JSONL content
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

暴露方法：
- `initDatabase()` — 创建表（IF NOT EXISTS）
- `createUser(email, username, password)` → User
- `authenticateUser(emailOrUsername, password)` → User | null
- `createToken(userId)` → token string
- `validateToken(token)` → User | null
- `revokeToken(token)`
- `updateUser(userId, updates)` → User
- `getUserSettings(userId)` → Record
- `setUserSetting(userId, key, value)`

### 2. Auth IPC Handlers (`src/main/auth-ipc-handlers.ts`)

注册到 `ipc-handlers.ts` 中，命名空间 `auth:*`：

```typescript
ipcMain.handle('auth:register', (_, email, username, password) => { ... })
ipcMain.handle('auth:login', (_, emailOrUsername, password) => { ... })
ipcMain.handle('auth:logout', (_, token) => { ... })
ipcMain.handle('auth:validate', (_, token) => { ... })  // 启动时验证已存 token
ipcMain.handle('auth:updateProfile', (_, token, updates) => { ... })
ipcMain.handle('auth:getSettings', (_, token) => { ... })
ipcMain.handle('auth:setSettings', (_, token, key, value) => { ... })
```

密码使用 `bcryptjs`（纯 JS 实现，无需 native rebuild）进行哈希。
Token 使用 `crypto.randomUUID()` + `crypto.randomBytes(32).toString('hex')` 生成。

### 3. Preload Bridge 扩展

在 `preload.ts` 中新增 `window.api.auth`：

```typescript
auth: {
  register: (email, username, password) => ipcRenderer.invoke('auth:register', email, username, password),
  login: (emailOrUsername, password) => ipcRenderer.invoke('auth:login', emailOrUsername, password),
  logout: (token) => ipcRenderer.invoke('auth:logout', token),
  validate: (token) => ipcRenderer.invoke('auth:validate', token),
  updateProfile: (token, updates) => ipcRenderer.invoke('auth:updateProfile', token, updates),
  getSettings: (token) => ipcRenderer.invoke('auth:getSettings', token),
  setSettings: (token, key, value) => ipcRenderer.invoke('auth:setSettings', token, key, value),
}
```

### 4. 类型定义 (`src/renderer/types/index.ts`)

```typescript
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  createdAt: number;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface AuthAPI {
  register: (email: string, username: string, password: string) => Promise<AuthResult>;
  login: (emailOrUsername: string, password: string) => Promise<AuthResult>;
  logout: (token: string) => Promise<boolean>;
  validate: (token: string) => Promise<AuthResult>;
  updateProfile: (token: string, updates: Partial<Pick<User, 'username' | 'avatarUrl'>>) => Promise<AuthResult>;
  getSettings: (token: string) => Promise<Record<string, unknown>>;
  setSettings: (token: string, key: string, value: unknown) => Promise<boolean>;
}
```

### 5. Auth Store (`src/renderer/stores/authStore.ts`)

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  // actions
  login: (emailOrUsername: string, password: string) => Promise<AuthResult>;
  register: (email: string, username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;  // 启动时调用
}
```

Token 持久化到 `localStorage`（key: `claude-studio-auth-token`）。
应用启动时 `validateSession()` 自动验证。

### 6. UI 组件

#### UserButton (`src/renderer/components/TopBar/UserButton.tsx`)

位置：TopBar 右侧，在 CommitButton 之后、分隔线之前。

- 未登录：显示一个用户图标按钮，点击打开 LoginModal
- 已登录：显示用户头像/首字母圆形头像，点击打开 UserMenu 下拉

#### LoginModal (`src/renderer/components/Auth/LoginModal.tsx`)

居中模态弹窗，两个 tab：登录 / 注册

登录表单：
- 邮箱或用户名输入框
- 密码输入框
- 登录按钮
- "没有账号？注册" 链接

注册表单：
- 邮箱输入框
- 用户名输入框
- 密码输入框（带强度提示）
- 确认密码输入框
- 注册按钮

样式遵循现有设计语言（bg-surface, border-border, text-text-primary 等 Tailwind token）。

#### UserMenu (`src/renderer/components/Auth/UserMenu.tsx`)

下拉菜单（与 OpenButton/CommitButton 风格一致）：
- 用户名 + 邮箱显示
- "个人设置" 选项（预留）
- "同步 Sessions" 选项（预留，灰色禁用）
- 分隔线
- "退出登录" 按钮

---

## 新增依赖

```json
{
  "better-sqlite3": "^11.0.0",   // SQLite 数据库
  "bcryptjs": "^2.4.3"           // 密码哈希 (纯 JS)
}
```

DevDependencies:
```json
{
  "@types/better-sqlite3": "^7.6.0",
  "@types/bcryptjs": "^2.4.0"
}
```

> 注意：`better-sqlite3` 是 native module，需要 `electron-rebuild`。项目已有 `@electron/rebuild` 和 `node-pty` 的 rebuild 流程，在 `postinstall` 中加入即可。

---

## 实现顺序

1. 安装依赖 (`better-sqlite3`, `bcryptjs` + types)
2. 创建 `auth-db.ts` — 数据库初始化 + CRUD
3. 创建 `auth-ipc-handlers.ts` — IPC handlers
4. 修改 `ipc-handlers.ts` — 引入并注册 auth handlers
5. 修改 `preload.ts` — 添加 `window.api.auth`
6. 修改 `types/index.ts` — 添加 Auth 相关类型
7. 创建 `authStore.ts` — 状态管理
8. 创建 `UserButton.tsx` — TopBar 用户按钮
9. 创建 `LoginModal.tsx` — 登录/注册弹窗
10. 创建 `UserMenu.tsx` — 用户下拉菜单
11. 修改 `TopBar.tsx` — 集成 UserButton
12. 修改 `App.tsx` — 启动时调用 `validateSession()`

---

## 后续扩展（本次不实现）

- Session 同步：将 `user_sessions` 表与本地 JSONL 文件双向同步
- 远程服务：将 SQLite 替换为远程 API（auth-db.ts 抽象层不变，只换实现）
- OAuth：GitHub / Google 第三方登录
- 用户设置云同步：将 `settingsStore` 的数据同步到 `user_settings` 表
