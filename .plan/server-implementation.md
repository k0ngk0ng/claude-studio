# Server 端实现方案

## 结构

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 入口，启动 Hono 服务
│   ├── db.ts             # SQLite 数据库层（复用现有表结构）
│   ├── auth.ts           # JWT 工具函数
│   └── routes/
│       ├── auth.ts       # POST /api/auth/register, /login, /logout, /validate, /profile
│       └── settings.ts   # GET/PUT /api/settings
```

## 技术栈

- Hono（HTTP 框架）+ @hono/node-server
- better-sqlite3（数据库）
- bcryptjs（密码哈希）
- jose（JWT，纯 JS 实现）
- 端口 3456

## 客户端改动

- `auth-ipc-handlers.ts` 改为 HTTP client，调 `http://localhost:3456/api/auth/*`
- 移除 main process 中的 `auth-db.ts` 直接依赖
- 服务端地址可配置（settings 中加 `serverUrl`）

## API 设计

```
POST /api/auth/register   { email, username, password } → { user, token }
POST /api/auth/login      { emailOrUsername, password } → { user, token }
POST /api/auth/logout     Authorization: Bearer <token>
GET  /api/auth/validate   Authorization: Bearer <token> → { user }
PUT  /api/auth/profile    Authorization: Bearer <token> { username?, avatarUrl? } → { user }
GET  /api/settings        Authorization: Bearer <token> → { settings }
PUT  /api/settings        Authorization: Bearer <token> { key, value }
```

## 实现顺序

1. 创建 server/ 目录 + package.json + tsconfig
2. 创建 db.ts（从现有 auth-db.ts 迁移）
3. 创建 auth.ts（JWT 工具）
4. 创建路由 routes/auth.ts + routes/settings.ts
5. 创建 index.ts 入口
6. 改造客户端 auth-ipc-handlers.ts → HTTP client
7. 验证编译
