import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

const BCRYPT_ROUNDS = 10;

let db: Database.Database | null = null;

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(os.homedir(), '.claude-studio');
}

function getDbPath(): string {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'auth.db');
}

export function initDatabase(): void {
  if (db) return;

  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      avatar_url  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_path TEXT NOT NULL,
      title       TEXT,
      session_data TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  console.log('[db] initialized at', getDbPath());
}

function getDb(): Database.Database {
  if (!db) initDatabase();
  return db!;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUser(email: string, username: string, password: string): { user: User } | { error: string } {
  const d = getDb();

  if (d.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return { error: 'Email already registered' };
  }
  if (d.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return { error: 'Username already taken' };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const hashedPassword = bcrypt.hashSync(password, BCRYPT_ROUNDS);

  d.prepare(`
    INSERT INTO users (id, email, username, password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email, username, hashedPassword, now, now);

  const user = rowToUser(d.prepare('SELECT * FROM users WHERE id = ?').get(id));
  return { user };
}

export function verifyPassword(emailOrUsername: string, password: string): { user: User } | { error: string } {
  const d = getDb();

  const row = d.prepare(
    'SELECT * FROM users WHERE email = ? OR username = ?'
  ).get(emailOrUsername, emailOrUsername) as any;

  if (!row) return { error: 'User not found' };
  if (!bcrypt.compareSync(password, row.password)) return { error: 'Invalid password' };

  return { user: rowToUser(row) };
}

export function getUserById(id: string): User | null {
  const d = getDb();
  const row = d.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  return row ? rowToUser(row) : null;
}

export function updateUser(userId: string, updates: { username?: string; avatarUrl?: string }): { user: User } | { error: string } {
  const d = getDb();
  const now = Date.now();
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (updates.username !== undefined) {
    const existing = d.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(updates.username, userId);
    if (existing) return { error: 'Username already taken' };
    fields.push('username = ?');
    values.push(updates.username);
  }

  if (updates.avatarUrl !== undefined) {
    fields.push('avatar_url = ?');
    values.push(updates.avatarUrl);
  }

  values.push(userId);
  d.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const user = getUserById(userId);
  if (!user) return { error: 'User not found' };
  return { user };
}

export function getUserSettings(userId: string): Record<string, unknown> {
  const d = getDb();
  const rows = d.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId) as any[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  return result;
}

export function setUserSetting(userId: string, key: string, value: unknown): void {
  const d = getDb();
  const now = Date.now();
  d.prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(userId, key, JSON.stringify(value), now);
}

export function closeDatabase(): void {
  if (db) { db.close(); db = null; }
}
