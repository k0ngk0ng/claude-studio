/**
 * Relay Client — manages WSS connection to the relay server for remote control.
 *
 * Handles:
 * - WebSocket connection with auth token
 * - Pairing flow (QR code generation, pairing code registration)
 * - E2EE encrypted message relay
 * - Heartbeat / reconnection
 * - Device list management
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws' ;
import QRCode from 'qrcode';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  generateKeyPair,
  deriveSession,
  encrypt,
  decrypt,
  generatePairingCode,
  generateDesktopId,
  type E2EEKeyPair,
  type E2EESession,
} from './e2ee';

// ─── Persistence path ─────────────────────────────────────────────────
const E2EE_PERSIST_PATH = path.join(os.homedir(), '.claude-studio', 'e2ee-sessions.json');

// ─── Types ───────────────────────────────────────────────────────────

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop';
  pairedAt: number;
  lastSeen?: number;
}

interface RelayMessage {
  type: string;
  [key: string]: unknown;
}

interface RelayConfig {
  serverUrl: string;
  token: string;
  deviceName: string;
}

// ─── Relay Client ────────────────────────────────────────────────────

export class RelayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: RelayConfig | null = null;
  private desktopId: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private intentionalClose = false;

  // Pairing state
  private pairingKeyPair: E2EEKeyPair | null = null;
  private pairingCode: string | null = null;

  // E2EE sessions keyed by peer deviceId
  private sessions = new Map<string, E2EESession>();
  private pairedDevices: PairedDevice[] = [];

  // Reconnect backoff
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;

  constructor() {
    super();
    this.desktopId = generateDesktopId();
    this.loadPersistedSessions();
  }

  getDesktopId(): string {
    return this.desktopId;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPairedDevices(): PairedDevice[] {
    return [...this.pairedDevices];
  }

  /**
   * Check if we have an E2EE session for a given device.
   */
  hasSession(deviceId: string): boolean {
    return this.sessions.has(deviceId);
  }

  // ─── E2EE Session Persistence ──────────────────────────────────────

  private savePersistedSessions(): void {
    try {
      const dir = path.dirname(E2EE_PERSIST_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const data = {
        sessions: Array.from(this.sessions.entries()).map(([deviceId, session]) => ({
          deviceId,
          derivedKey: Buffer.from(session.derivedKey).toString('hex'),
          seq: session.seq,
          peerSeq: session.peerSeq,
        })),
        pairedDevices: this.pairedDevices,
      };
      fs.writeFileSync(E2EE_PERSIST_PATH, JSON.stringify(data), 'utf-8');
    } catch {
      // Ignore save errors
    }
  }

  private loadPersistedSessions(): void {
    try {
      if (!fs.existsSync(E2EE_PERSIST_PATH)) return;
      const raw = fs.readFileSync(E2EE_PERSIST_PATH, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.sessions)) {
        for (const entry of data.sessions) {
          if (!entry.deviceId || !entry.derivedKey) continue;
          this.sessions.set(entry.deviceId, {
            sharedSecret: Buffer.alloc(0), // Not needed for encrypt/decrypt, only derivedKey matters
            derivedKey: Buffer.from(entry.derivedKey, 'hex'),
            seq: entry.seq || 0,
            peerSeq: entry.peerSeq ?? -1,
          });
        }
      }

      if (Array.isArray(data.pairedDevices)) {
        this.pairedDevices = data.pairedDevices;
      }
    } catch {
      // Ignore load errors
    }
  }

  // ─── Connection ──────────────────────────────────────────────────

  async connect(config: RelayConfig): Promise<boolean> {
    this.config = config;
    this.intentionalClose = false;
    return this.doConnect();
  }

  private doConnect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.config) {
        resolve(false);
        return;
      }

      const { serverUrl, token } = this.config;

      // Convert http(s) to ws(s)
      const wsUrl = serverUrl
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:');

      const url = `${wsUrl}/ws/relay?token=${encodeURIComponent(token)}&deviceType=desktop&deviceId=${this.desktopId}&deviceName=${encodeURIComponent(this.config.deviceName)}`;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        console.error('[relay] Failed to create WebSocket:', err);
        resolve(false);
        return;
      }

      const connectTimeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          resolve(false);
        }
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connected');
        console.log('[relay] Connected to relay server');
        resolve(true);
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg: RelayMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          console.error('[relay] Failed to parse message:', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        const wasConnected = this.connected;
        this.connected = false;
        this.stopHeartbeat();

        if (wasConnected) {
          this.emit('disconnected');
          console.log(`[relay] Disconnected: ${code} ${reason?.toString()}`);
        }

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }

        if (!wasConnected) {
          resolve(false);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[relay] WebSocket error:', err.message);
      });
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnect();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    // Don't clear E2EE sessions — they persist across reconnects.
    // Save current seq counters before disconnecting.
    this.savePersistedSessions();
    this.pairingKeyPair = null;
    this.pairingCode = null;
    this.emit('disconnected');
  }

  // ─── Heartbeat ───────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat' });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Reconnect ──────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[relay] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch(() => {});
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Send ────────────────────────────────────────────────────────

  private send(msg: RelayMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send an encrypted message to a paired device.
   */
  sendEncrypted(targetDeviceId: string, plaintext: string): boolean {
    const session = this.sessions.get(targetDeviceId);
    if (!session) {
      console.error(`[relay] No E2EE session for device ${targetDeviceId}`);
      return false;
    }

    const { payload, seq } = encrypt(session, plaintext);

    // Periodically persist seq counters
    if (seq % 5 === 0) {
      this.savePersistedSessions();
    }

    return this.send({
      type: 'relay',
      to: targetDeviceId,
      payload,
      seq,
    });
  }

  // ─── Pairing ─────────────────────────────────────────────────────

  /**
   * Generate a pairing QR code. Returns a data URL (PNG base64).
   * Registers the pairing code with the relay server.
   */
  async generatePairingQR(): Promise<string | null> {
    if (!this.connected || !this.config) return null;

    // Generate fresh ECDH key pair and pairing code
    this.pairingKeyPair = generateKeyPair();
    this.pairingCode = generatePairingCode();

    console.log(`[relay] generatePairingQR: pairingCode=${this.pairingCode.slice(0, 8)}..., pubKey prefix=${this.pairingKeyPair.publicKey.slice(0, 16)}...`);

    // Register pairing with server
    this.send({
      type: 'register-pairing',
      pairingCode: this.pairingCode,
      publicKey: this.pairingKeyPair.publicKey,
      desktopId: this.desktopId,
      deviceName: this.config.deviceName,
    });

    // Build QR content — includes token so mobile can connect without separate login
    const qrContent = JSON.stringify({
      s: this.config.serverUrl,
      t: this.config.token,
      p: this.pairingCode,
      k: this.pairingKeyPair.publicKey,
      d: this.desktopId,
    });

    try {
      const dataUrl = await QRCode.toDataURL(qrContent, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return dataUrl;
    } catch (err) {
      console.error('[relay] Failed to generate QR code:', err);
      return null;
    }
  }

  /**
   * Revoke pairing with a specific device.
   */
  revokePairing(deviceId: string): boolean {
    this.sessions.delete(deviceId);
    this.pairedDevices = this.pairedDevices.filter(d => d.deviceId !== deviceId);
    this.savePersistedSessions();

    return this.send({
      type: 'revoke-pairing',
      targetDeviceId: deviceId,
    });
  }

  // ─── Message handling ────────────────────────────────────────────

  private handleMessage(msg: RelayMessage): void {
    switch (msg.type) {
      case 'pong':
        // Heartbeat response — no action needed
        break;

      case 'pairing-accepted': {
        // A mobile device claimed our pairing code
        const mobilePublicKey = msg.mobilePublicKey as string;
        const mobileDeviceId = msg.mobileDeviceId as string;
        const mobileDeviceName = msg.mobileDeviceName as string;

        console.log(`[relay] pairing-accepted from ${mobileDeviceName} (${mobileDeviceId}), have keyPair: ${!!this.pairingKeyPair}, have code: ${!!this.pairingCode}`);

        if (this.pairingKeyPair && this.pairingCode) {
          // Derive shared secret
          const session = deriveSession(
            this.pairingKeyPair.ecdh,
            mobilePublicKey,
            this.pairingCode,
          );
          this.sessions.set(mobileDeviceId, session);
          console.log(`[relay] Derived new E2EE session for ${mobileDeviceId}, derivedKey prefix: ${Buffer.from(session.derivedKey).toString('hex').slice(0, 16)}...`);

          // Track paired device
          const device: PairedDevice = {
            deviceId: mobileDeviceId,
            deviceName: mobileDeviceName,
            deviceType: 'mobile',
            pairedAt: Date.now(),
            lastSeen: Date.now(),
          };
          this.pairedDevices = this.pairedDevices.filter(d => d.deviceId !== mobileDeviceId);
          this.pairedDevices.push(device);

          // Persist E2EE sessions for app restarts
          this.savePersistedSessions();

          // Clear pairing state
          this.pairingKeyPair = null;
          this.pairingCode = null;

          this.emit('paired', device);
          console.log(`[relay] Paired with mobile device: ${mobileDeviceName} (${mobileDeviceId})`);
        } else {
          console.warn(`[relay] Ignoring pairing-accepted — no active pairing state (keyPair or code is null)`);
        }
        break;
      }

      case 'pairing-revoked': {
        const deviceId = msg.deviceId as string;
        this.sessions.delete(deviceId);
        this.pairedDevices = this.pairedDevices.filter(d => d.deviceId !== deviceId);
        this.savePersistedSessions();
        this.emit('pairing-revoked', deviceId);
        break;
      }

      case 'relay': {
        // Encrypted message from a paired device
        const from = msg.from as string;
        const payload = msg.payload as string;
        const seq = msg.seq as number;
        const session = this.sessions.get(from);

        if (!session) {
          console.warn(`[relay] Received relay from unknown device: ${from}`);
          break;
        }

        try {
          console.log(`[relay] Decrypting from ${from}: seq=${seq}, peerSeq=${session.peerSeq}, keyPrefix=${Buffer.from(session.derivedKey).toString('hex').slice(0, 16)}`);
          const plaintext = decrypt(session, payload, seq);
          const parsed = JSON.parse(plaintext);

          // Update last seen
          const device = this.pairedDevices.find(d => d.deviceId === from);
          if (device) device.lastSeen = Date.now();

          this.emit('message', from, parsed);

          // Periodically persist seq counters (every 5 messages)
          if (session.peerSeq % 5 === 0) {
            this.savePersistedSessions();
          }
        } catch (err) {
          console.error(`[relay] Failed to decrypt message from ${from}:`, err);
          // Decryption failed — keys are out of sync (e.g. mobile re-paired while desktop was offline).
          // Remove the stale session so next pairing can start fresh.
          this.sessions.delete(from);
          this.savePersistedSessions();
          console.log(`[relay] Removed stale E2EE session for ${from} — re-pairing required`);
        }
        break;
      }

      case 'device-online': {
        const deviceId = msg.deviceId as string;
        const device = this.pairedDevices.find(d => d.deviceId === deviceId);
        if (device) {
          device.lastSeen = Date.now();

          // Mobile reconnected — reset peerSeq so we accept its next seq
          // (mobile persists seq, but it may have rolled back on reload)
          if (device.deviceType === 'mobile') {
            const session = this.sessions.get(deviceId);
            if (session) {
              session.peerSeq = -1;
              this.savePersistedSessions();
            }
          }

          this.emit('device-online', deviceId);
        }
        break;
      }

      case 'device-offline': {
        const deviceId = msg.deviceId as string;
        this.emit('device-offline', deviceId);
        break;
      }

      case 'control-request': {
        // Mobile device requesting control
        const deviceId = msg.from as string;
        const deviceName = msg.deviceName as string;
        this.emit('control-request', deviceId, deviceName);
        break;
      }

      case 'control-release': {
        // Mobile device releasing control
        const deviceId = msg.from as string;
        this.emit('control-release', deviceId);
        break;
      }

      case 'error': {
        console.error('[relay] Server error:', msg.message);
        this.emit('relay-error', msg.message);
        break;
      }

      default:
        console.log('[relay] Unknown message type:', msg.type);
    }
  }

  /**
   * Send a control acknowledgment to a mobile device.
   */
  sendControlAck(mobileDeviceId: string, accepted: boolean): boolean {
    return this.send({
      type: 'control-ack',
      to: mobileDeviceId,
      accepted,
    });
  }

  /**
   * Notify mobile device that control has been revoked (desktop unlocked).
   */
  sendControlRevoked(mobileDeviceId: string): boolean {
    return this.send({
      type: 'control-revoked',
      to: mobileDeviceId,
    });
  }

  /**
   * Send an event to a paired mobile device (e.g., streaming updates).
   */
  sendEvent(targetDeviceId: string, channel: string, data: unknown): boolean {
    const message = JSON.stringify({ type: 'event', channel, data });
    return this.sendEncrypted(targetDeviceId, message);
  }

  /**
   * Send a response to a remote command.
   */
  sendResponse(targetDeviceId: string, id: string, result?: unknown, error?: string): boolean {
    const message = JSON.stringify({ type: 'response', id, result, error });
    return this.sendEncrypted(targetDeviceId, message);
  }
}

// Singleton instance
export const relayClient = new RelayClient();
