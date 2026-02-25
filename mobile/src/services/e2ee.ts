/**
 * E2EE crypto module for React Native.
 *
 * Uses @noble/curves for ECDH (P-256), @noble/hashes for HKDF-SHA256,
 * and @noble/ciphers for AES-256-GCM. All pure JS — no native deps needed.
 *
 * Uses react-native-get-random-values polyfill (imported in index.js)
 * instead of expo-crypto.
 *
 * Wire-compatible with the desktop Node.js crypto implementation.
 */

import { p256 } from '@noble/curves/p256';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';

// ─── Types ───────────────────────────────────────────────────────────

export interface E2EEKeyPair {
  publicKey: string;   // hex-encoded uncompressed P-256 point
  privateKey: Uint8Array;
}

export interface E2EESession {
  derivedKey: Uint8Array;  // AES-256 key (32 bytes)
  seq: number;             // outbound sequence
  peerSeq: number;         // last inbound sequence
}

// ─── Key Generation ──────────────────────────────────────────────────

/**
 * Generate an ECDH P-256 key pair.
 * Returns public key as hex (uncompressed, matching Node.js ECDH output).
 */
export function generateKeyPair(): E2EEKeyPair {
  const privateKey = p256.utils.randomPrivateKey();
  const publicKeyPoint = p256.getPublicKey(privateKey, false); // uncompressed
  return {
    publicKey: bytesToHex(publicKeyPoint),
    privateKey,
  };
}

/**
 * Export public key to hex string (for compatibility with existing API).
 */
export function exportPublicKey(keyPair: E2EEKeyPair): string {
  return keyPair.publicKey;
}

// ─── Session Derivation ──────────────────────────────────────────────

/**
 * Derive an E2EE session from our private key + peer's public key hex.
 * Uses ECDH shared secret → HKDF-SHA256 → AES-256 key.
 * Compatible with desktop Node.js implementation.
 */
export function deriveSession(
  privateKey: Uint8Array,
  peerPublicKeyHex: string,
  pairingCode: string,
): E2EESession {
  // ECDH: compute shared secret
  const peerPublicKey = hexToBytes(peerPublicKeyHex);
  const sharedSecret = p256.getSharedSecret(privateKey, peerPublicKey);

  // The shared secret from @noble includes the 0x04 prefix for uncompressed point.
  // Node.js ECDH.computeSecret returns just the x-coordinate (32 bytes).
  // @noble/curves getSharedSecret returns the x-coordinate only (32 bytes) by default
  // when compress=true, but with compress=false it returns the full point.
  // We need just the x-coordinate to match Node.js behavior.
  const sharedX = sharedSecret.slice(1, 33); // skip 0x04 prefix, take x (32 bytes)

  // HKDF-SHA256: derive AES key (matches desktop hkdfSha256 implementation)
  const salt = new TextEncoder().encode(pairingCode);
  const info = new TextEncoder().encode('claude-studio-e2ee');
  const derivedKey = hkdf(sha256, sharedX, salt, info, 32);

  return {
    derivedKey,
    seq: 0,
    peerSeq: -1,
  };
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns { payload: base64(iv + ciphertext + tag), seq }
 * Wire-compatible with desktop: IV (12) + ciphertext + authTag (16)
 */
export function encrypt(
  session: E2EESession,
  plaintext: string,
): { payload: string; seq: number } {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const aes = gcm(session.derivedKey, iv);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = aes.encrypt(encoded); // returns ciphertext + tag appended

  // Combine: iv (12) + ciphertext + tag (already appended by gcm)
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  const seq = session.seq++;
  return {
    payload: uint8ToBase64(combined),
    seq,
  };
}

/**
 * Decrypt a base64 payload (iv + ciphertext + tag).
 */
export function decrypt(
  session: E2EESession,
  payload: string,
  seq: number,
): string {
  // Replay protection
  if (seq <= session.peerSeq) {
    throw new Error(`Replay detected: seq ${seq} <= last ${session.peerSeq}`);
  }
  session.peerSeq = seq;

  const combined = base64ToUint8(payload);
  const iv = combined.slice(0, 12);
  const ciphertextWithTag = combined.slice(12); // ciphertext + authTag (16)

  const aes = gcm(session.derivedKey, iv);
  const decrypted = aes.decrypt(ciphertextWithTag);

  return new TextDecoder().decode(decrypted);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a unique device ID for this mobile device.
 */
export function generateDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
