#!/usr/bin/env node

// ClaudeStudio Server — Admin CLI
// Usage: node admin.js <command> [args]
//
// Commands:
//   users                    List all users
//   user <email|username>    Show user details
//   create <email> <username> <password>   Create a user
//   delete <email|username>  Delete a user
//   reset-password <email|username> <new_password>  Reset password

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), '.claude-studio');
const DB_PATH = path.join(DATA_DIR, 'auth.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  console.error(`Set DATA_DIR env var if using a custom path.`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: false });

const [,, cmd, ...args] = process.argv;

function formatDate(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

switch (cmd) {
  case 'users': {
    const rows = db.prepare('SELECT id, email, username, created_at, updated_at FROM users ORDER BY created_at DESC').all();
    if (rows.length === 0) {
      console.log('No users.');
    } else {
      console.log(`${'ID'.padEnd(38)} ${'Email'.padEnd(30)} ${'Username'.padEnd(20)} Created`);
      console.log('-'.repeat(110));
      for (const r of rows) {
        console.log(`${r.id.padEnd(38)} ${r.email.padEnd(30)} ${r.username.padEnd(20)} ${formatDate(r.created_at)}`);
      }
      console.log(`\nTotal: ${rows.length}`);
    }
    break;
  }

  case 'user': {
    const q = args[0];
    if (!q) { console.error('Usage: admin.js user <email|username>'); process.exit(1); }
    const row = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(q, q);
    if (!row) { console.error('User not found.'); process.exit(1); }
    console.log({
      id: row.id,
      email: row.email,
      username: row.username,
      avatarUrl: row.avatar_url,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    });
    break;
  }

  case 'create': {
    const [email, username, password] = args;
    if (!email || !username || !password) {
      console.error('Usage: admin.js create <email> <username> <password>');
      process.exit(1);
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const hashed = bcrypt.hashSync(password, 10);
    try {
      db.prepare('INSERT INTO users (id, email, username, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, email.toLowerCase(), username, hashed, now, now);
      console.log(`User created: ${username} <${email}> (${id})`);
    } catch (err) {
      console.error('Failed:', err.message);
      process.exit(1);
    }
    break;
  }

  case 'delete': {
    const q = args[0];
    if (!q) { console.error('Usage: admin.js delete <email|username>'); process.exit(1); }
    const row = db.prepare('SELECT id, email, username FROM users WHERE email = ? OR username = ?').get(q, q);
    if (!row) { console.error('User not found.'); process.exit(1); }
    db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
    console.log(`Deleted: ${row.username} <${row.email}>`);
    break;
  }

  case 'reset-password': {
    const [q, newPass] = args;
    if (!q || !newPass) {
      console.error('Usage: admin.js reset-password <email|username> <new_password>');
      process.exit(1);
    }
    const row = db.prepare('SELECT id, username FROM users WHERE email = ? OR username = ?').get(q, q);
    if (!row) { console.error('User not found.'); process.exit(1); }
    const hashed = bcrypt.hashSync(newPass, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(hashed, Date.now(), row.id);
    console.log(`Password reset for: ${row.username}`);
    break;
  }

  default:
    console.log(`ClaudeStudio Server Admin CLI

Usage: node admin.js <command> [args]

Commands:
  users                                   List all users
  user <email|username>                   Show user details
  create <email> <username> <password>    Create a user
  delete <email|username>                 Delete a user
  reset-password <email|username> <pass>  Reset password

Environment:
  DATA_DIR  Database location (default: ~/.claude-studio)`);
}

db.close();
