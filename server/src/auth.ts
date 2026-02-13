import * as jose from 'jose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TOKEN_EXPIRY = '30d';
let secret: Uint8Array | null = null;

function getSecretPath(): string {
  const dir = process.env.DATA_DIR || path.join(os.homedir(), '.claude-studio');
  return path.join(dir, 'jwt-secret');
}

function getSecret(): Uint8Array {
  if (secret) return secret;

  const secretPath = getSecretPath();
  if (fs.existsSync(secretPath)) {
    secret = new Uint8Array(Buffer.from(fs.readFileSync(secretPath, 'utf-8'), 'hex'));
  } else {
    const raw = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, raw.toString('hex'), { mode: 0o600 });
    secret = new Uint8Array(raw);
  }
  return secret;
}

export async function signToken(userId: string): Promise<string> {
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}
