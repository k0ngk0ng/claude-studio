/**
 * E2EE (End-to-End Encryption) module for remote control communication.
 *
 * Uses ECDH (P-256) for key exchange and AES-256-GCM for symmetric encryption.
 * The relay server never sees plaintext — only encrypted payloads.
 */

import crypto from 'crypto';

const CURVE = 'prime256v1'; // P-256 / secp256r1
const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96-bit IV for GCM
const TAG_LENGTH = 16;      // 128-bit auth tag

export interface E2EEKeyPair {
  publicKey: string;   // hex-encoded
  privateKey: string;  // hex-encoded
  ecdh: crypto.ECDH;
}

export interface E2EESession {
  sharedSecret: Buffer;
  derivedKey: Buffer;  // AES-256 key derived via HKDF
  seq: number;         // outbound sequence number for replay protection
  peerSeq: number;     // last seen inbound sequence number
}

/**
 * Generate a new ECDH key pair for pairing.
 */
export function generateKeyPair(): E2EEKeyPair {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey('hex'),
    privateKey: ecdh.getPrivateKey('hex'),
    ecdh,
  };
}

/**
 * Derive a shared secret and AES key from our ECDH instance + peer's public key.
 * Uses HKDF-SHA256 with the pairing code as salt for domain separation.
 */
export function deriveSession(ecdh: crypto.ECDH, peerPublicKeyHex: string, pairingCode: string): E2EESession {
  const sharedSecret = ecdh.computeSecret(Buffer.from(peerPublicKeyHex, 'hex'));

  // HKDF: extract + expand
  const salt = Buffer.from(pairingCode, 'utf-8');
  const info = Buffer.from('claude-studio-e2ee', 'utf-8');
  const derivedKey = hkdfSha256(sharedSecret, salt, info, 32);

  return {
    sharedSecret,
    derivedKey,
    seq: 0,
    peerSeq: -1,
  };
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 * Returns base64-encoded: IV (12) + ciphertext + authTag (16)
 */
export function encrypt(session: E2EESession, plaintext: string): { payload: string; seq: number } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGO, session.derivedKey, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // IV + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  const seq = session.seq++;

  return {
    payload: combined.toString('base64'),
    seq,
  };
}

/**
 * Decrypt a base64-encoded payload (IV + ciphertext + authTag).
 * Validates sequence number to prevent replay attacks.
 */
export function decrypt(session: E2EESession, payload: string, seq: number): string {
  // Replay protection: reject old or duplicate sequence numbers
  if (seq <= session.peerSeq) {
    throw new Error(`Replay detected: seq ${seq} <= last seen ${session.peerSeq}`);
  }
  session.peerSeq = seq;

  const combined = Buffer.from(payload, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(AES_ALGO, session.derivedKey, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

/**
 * Generate a random pairing code (UUID v4 format).
 */
export function generatePairingCode(): string {
  return crypto.randomUUID();
}

/**
 * Generate a unique device ID for this desktop instance.
 *
 * Supports multiple modes:
 * 1. CLAUDE_STUDIO_INSTANCE_ID env var - use custom instance ID (useful for dev)
 * 2. Persisted UUID + username - stable across restarts for same user
 *
 * This allows running multiple desktop instances simultaneously for development.
 */
export function generateDesktopId(): string {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  // Mode 1: Custom instance ID from environment variable (for dev/development)
  const instanceId = process.env.CLAUDE_STUDIO_INSTANCE_ID;
  if (instanceId) {
    return crypto.createHash('sha256').update(instanceId).digest('hex').substring(0, 16);
  }

  const configDir = path.join(os.homedir(), '.claude-studio');
  const idFile = path.join(configDir, 'device-id');

  // Mode 2: Load or generate a stable machine UUID
  let machineUuid: string;
  try {
    machineUuid = fs.readFileSync(idFile, 'utf-8').trim();
  } catch {
    machineUuid = crypto.randomUUID();
    try {
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(idFile, machineUuid, 'utf-8');
    } catch {
      // Fall back to non-persisted UUID (will change on restart, but better than crashing)
    }
  }

  const username = os.userInfo().username;
  return crypto.createHash('sha256').update(`${machineUuid}-${username}`).digest('hex').substring(0, 16);
}

// ─── HKDF-SHA256 implementation ──────────────────────────────────────

function hkdfSha256(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  // Extract
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();

  // Expand
  const n = Math.ceil(length / 32);
  const okm = Buffer.alloc(n * 32);
  let prev = Buffer.alloc(0);

  for (let i = 0; i < n; i++) {
    const input = Buffer.concat([prev, info, Buffer.from([i + 1])]);
    prev = crypto.createHmac('sha256', prk).update(input).digest();
    prev.copy(okm, i * 32);
  }

  return okm.subarray(0, length);
}
