/**
 * Mobile Relay Client — WebSocket connection to relay server.
 *
 * Handles pairing, E2EE messaging, and remote command execution.
 * No login required — token comes from the scanned QR code.
 */

import {
  generateKeyPair,
  exportPublicKey,
  deriveSession,
  encrypt,
  decrypt,
  generateDeviceId,
  type E2EEKeyPair,
  type E2EESession,
} from './e2ee';
import * as SecureStore from 'expo-secure-store';
import type { DesktopInfo, QRPayload, RemoteCommand, RemoteResponse, RemoteEvent } from '../types';

const DEVICE_ID_KEY = 'claude-studio-device-id';
const RELAY_CONFIG_KEY = 'claude-studio-relay-config';
const E2EE_SESSIONS_KEY = 'claude-studio-e2ee-sessions';
const DEVICE_NAME = 'Mobile';

// ─── Types ───────────────────────────────────────────────────────────

type EventHandler = (event: string, data: any) => void;
type StateHandler = (state: RelayState) => void;

export interface RelayState {
  connected: boolean;
  desktops: DesktopInfo[];
  controllingDesktopId: string | null;
}

interface SavedConfig {
  serverUrl: string;
  token: string;
}

interface PendingCommand {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ─── Relay Client ────────────────────────────────────────────────────

class MobileRelayClient {
  private ws: WebSocket | null = null;
  private deviceId: string | null = null;
  private connected = false;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;

  // Connection config (from QR code, persisted)
  private serverUrl: string | null = null;
  private token: string | null = null;

  // E2EE sessions keyed by desktop deviceId
  private sessions = new Map<string, E2EESession>();

  // Pairing state
  private pairingKeyPair: E2EEKeyPair | null = null;

  // Listeners
  private eventHandlers = new Set<EventHandler>();
  private stateHandlers = new Set<StateHandler>();

  // Pending remote command responses
  private pendingCommands = new Map<string, PendingCommand>();

  // State
  private desktops: DesktopInfo[] = [];
  private controllingDesktopId: string | null = null;

  // ─── Device ID ─────────────────────────────────────────────────

  async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;

    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = generateDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    this.deviceId = id;
    return id;
  }

  // ─── Saved config (persisted from last QR scan) ────────────────

  async loadSavedConfig(): Promise<SavedConfig | null> {
    try {
      const raw = await SecureStore.getItemAsync(RELAY_CONFIG_KEY);
      if (raw) {
        const config = JSON.parse(raw) as SavedConfig;
        if (config.serverUrl && config.token) {
          this.serverUrl = config.serverUrl;
          this.token = config.token;
          // Restore E2EE sessions from previous pairing
          await this.loadE2EESessions();
          return config;
        }
      }
    } catch {}
    return null;
  }

  private async saveConfig(serverUrl: string, token: string): Promise<void> {
    this.serverUrl = serverUrl;
    this.token = token;
    await SecureStore.setItemAsync(RELAY_CONFIG_KEY, JSON.stringify({ serverUrl, token }));
  }

  async clearConfig(): Promise<void> {
    this.serverUrl = null;
    this.token = null;
    await SecureStore.deleteItemAsync(RELAY_CONFIG_KEY);
    await SecureStore.deleteItemAsync(E2EE_SESSIONS_KEY);
  }

  hasConfig(): boolean {
    return !!(this.serverUrl && this.token);
  }

  // ─── E2EE Session Persistence ─────────────────────────────────────

  /**
   * Save E2EE sessions to SecureStore so they survive app restarts.
   * derivedKey is stored as hex string. Also saves deviceName for local desktop list.
   */
  private async saveE2EESessions(): Promise<void> {
    try {
      const entries: Array<{ desktopId: string; deviceName: string; derivedKey: string; seq: number; peerSeq: number }> = [];
      for (const [desktopId, session] of this.sessions) {
        // Find device name from desktops list
        const desktop = this.desktops.find(d => d.desktopId === desktopId);
        entries.push({
          desktopId,
          deviceName: desktop?.deviceName || 'Desktop',
          derivedKey: Array.from(session.derivedKey).map(b => b.toString(16).padStart(2, '0')).join(''),
          seq: session.seq,
          peerSeq: session.peerSeq,
        });
      }
      await SecureStore.setItemAsync(E2EE_SESSIONS_KEY, JSON.stringify(entries));
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Load persisted E2EE sessions from SecureStore.
   * Also rebuilds the desktop list from persisted sessions (local-first).
   */
  async loadE2EESessions(): Promise<void> {
    try {
      const raw = await SecureStore.getItemAsync(E2EE_SESSIONS_KEY);
      if (!raw) {
        console.log('[relay] No persisted E2EE sessions found');
        return;
      }
      const entries = JSON.parse(raw) as Array<{ desktopId: string; deviceName?: string; derivedKey: string; seq: number; peerSeq: number }>;
      for (const entry of entries) {
        if (!entry.desktopId || !entry.derivedKey) continue;
        const keyBytes = new Uint8Array(entry.derivedKey.length / 2);
        for (let i = 0; i < entry.derivedKey.length; i += 2) {
          keyBytes[i / 2] = parseInt(entry.derivedKey.substring(i, i + 2), 16);
        }
        this.sessions.set(entry.desktopId, {
          derivedKey: keyBytes,
          seq: entry.seq || 0,
          peerSeq: entry.peerSeq ?? -1,
        });

        // Rebuild desktop list from persisted sessions (offline by default, server will update)
        if (!this.desktops.find(d => d.desktopId === entry.desktopId)) {
          this.desktops.push({
            desktopId: entry.desktopId,
            deviceName: entry.deviceName || 'Desktop',
            online: false,
          });
        }

        console.log(`[relay] Loaded E2EE session for ${entry.desktopId}: seq=${entry.seq}, peerSeq=${entry.peerSeq}, keyPrefix=${entry.derivedKey.slice(0, 16)}`);
      }
      console.log(`[relay] Loaded ${entries.length} persisted E2EE session(s)`);
    } catch {
      // Ignore load errors
    }
  }

  // ─── Connection ────────────────────────────────────────────────

  /**
   * Connect using explicit serverUrl + token (from QR code).
   */
  async connectWithConfig(serverUrl: string, token: string): Promise<boolean> {
    await this.saveConfig(serverUrl, token);
    this.intentionalClose = false;
    return this.doConnect();
  }

  /**
   * Reconnect using saved config.
   */
  async connect(): Promise<boolean> {
    if (!this.serverUrl || !this.token) {
      const config = await this.loadSavedConfig();
      if (!config) return false;
    }
    this.intentionalClose = false;
    return this.doConnect();
  }

  private async doConnect(): Promise<boolean> {
    if (!this.serverUrl || !this.token) return false;

    const deviceId = await this.getDeviceId();
    const wsUrl = this.serverUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const url = `${wsUrl}/ws/relay?token=${encodeURIComponent(this.token)}&deviceType=mobile&deviceId=${deviceId}&deviceName=${encodeURIComponent(DEVICE_NAME)}`;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url);
      } catch {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          resolve(false);
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emitState();
        resolve(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          this.handleMessage(msg);
        } catch {}
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        const was = this.connected;
        this.connected = false;
        this.stopHeartbeat();
        this.emitState();

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }

        if (!was) resolve(false);
      };

      this.ws.onerror = () => {};
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnect();
    this.ws?.close(1000);
    this.ws = null;
    this.connected = false;
    // Don't clear E2EE sessions — they persist across reconnects.
    // Only clearConfig() wipes them (user-initiated unpair).
    this.controllingDesktopId = null;
    this.emitState();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getState(): RelayState {
    return {
      connected: this.connected,
      desktops: [...this.desktops],
      controllingDesktopId: this.controllingDesktopId,
    };
  }

  // ─── Heartbeat ─────────────────────────────────────────────────

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

  // ─── Reconnect ─────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
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

  // ─── Send ──────────────────────────────────────────────────────

  private send(msg: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  sendEncrypted(targetDeviceId: string, plaintext: string): boolean {
    const session = this.sessions.get(targetDeviceId);
    if (!session) return false;

    const keyHex = Array.from(session.derivedKey as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`[relay] Encrypting for ${targetDeviceId}: seq=${session.seq}, keyPrefix=${keyHex.slice(0, 16)}`);

    const { payload, seq } = encrypt(session, plaintext);

    // Persist seq after every encrypt to prevent replay on reload
    this.saveE2EESessions();

    return this.send({ type: 'relay', to: targetDeviceId, payload, seq });
  }

  // ─── Pairing ───────────────────────────────────────────────────

  /**
   * Full pairing flow from QR code:
   * 1. Connect to relay using serverUrl + token from QR (or reuse existing connection)
   * 2. Claim the pairing code
   * Returns true if connected + claim sent successfully.
   */
  async pairFromQR(qrPayload: QRPayload): Promise<boolean> {
    // Prevent duplicate pairing attempts — if we already have a pending session, ignore
    if ((this as any)._pendingSession) {
      console.log('[relay] pairFromQR: already have a pending session, ignoring duplicate scan');
      return true; // Return true so caller waits for the existing pairing-accepted
    }

    // Save config for future reconnects
    await this.saveConfig(qrPayload.s, qrPayload.t);

    // Connect to relay if not already connected
    if (!this.connected) {
      const connected = await this.doConnect();
      if (!connected) return false;
    }

    // Generate our ECDH key pair
    this.pairingKeyPair = generateKeyPair();
    const publicKey = exportPublicKey(this.pairingKeyPair);

    console.log(`[relay] pairFromQR: desktopId=${qrPayload.d}, pairingCode=${qrPayload.p.slice(0, 8)}..., desktopPubKey prefix=${qrPayload.k.slice(0, 16)}...`);

    // Pre-derive the session using the desktop's public key from QR
    const session = deriveSession(
      this.pairingKeyPair.privateKey,
      qrPayload.k,
      qrPayload.p,
    );

    const keyHex = Array.from(session.derivedKey as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`[relay] pairFromQR: pre-derived key prefix: ${keyHex.slice(0, 16)}...`);

    // Store pending session — will be committed on pairing-accepted
    (this as any)._pendingSession = {
      desktopId: qrPayload.d,
      session,
    };

    // Send claim to server
    return this.send({
      type: 'claim-pairing',
      pairingCode: qrPayload.p,
      publicKey,
    });
  }

  // ─── Remote Control ────────────────────────────────────────────

  /**
   * Check if we have an E2EE session for a given desktop.
   */
  hasSession(desktopId: string): boolean {
    return this.sessions.has(desktopId);
  }

  /**
   * Forget a desktop — remove its E2EE session, from the list, and revoke pairing on server.
   * Used to clean up stale entries that need re-pairing.
   */
  async forgetDesktop(desktopId: string): Promise<void> {
    this.sessions.delete(desktopId);
    this.desktops = this.desktops.filter(d => d.desktopId !== desktopId);
    await this.saveE2EESessions();
    // Tell relay server to remove the pairing so it won't send this desktop in device-list
    this.send({ type: 'revoke-pairing', targetDeviceId: desktopId });
    this.emitState();
  }

  requestControl(desktopId: string): boolean {
    return this.send({
      type: 'control-request',
      targetDesktopId: desktopId,
    });
  }

  releaseControl(desktopId: string): void {
    this.send({
      type: 'control-release',
      targetDesktopId: desktopId,
    });
    this.controllingDesktopId = null;
  }

  // ─── Remote Commands ───────────────────────────────────────────

  executeCommand(desktopId: string, channel: string, args: unknown[] = []): Promise<any> {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const command: RemoteCommand = { type: 'command', id, channel, args };
    const sent = this.sendEncrypted(desktopId, JSON.stringify(command));

    if (!sent) throw new Error('Failed to send command');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error('Command timeout — desktop may need re-pairing'));
      }, 15000);

      this.pendingCommands.set(id, { resolve, reject, timeout });
    });
  }

  // ─── Message Handling ──────────────────────────────────────────

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'pong':
        break;

      case 'device-list': {
        // Server sends list of online desktops — use it to update online status only.
        // Desktop list is managed locally based on E2EE sessions.
        const serverDesktops = (msg.desktops || []) as Array<{ desktopId: string; deviceName: string; online: boolean }>;
        const onlineIds = new Set(serverDesktops.filter(d => d.online).map(d => d.desktopId));

        // Update online status for existing local desktops
        this.desktops = this.desktops.map(d => ({
          ...d,
          online: onlineIds.has(d.desktopId),
        }));

        this.emitState();
        break;
      }

      case 'pairing-accepted': {
        const pending = (this as any)._pendingSession;
        console.log(`[relay] pairing-accepted, have pending: ${!!pending}, desktopId from msg: ${msg.desktopId}, from pending: ${pending?.desktopId}`);
        if (pending && (msg.desktopId || pending.desktopId)) {
          const desktopId = msg.desktopId || pending.desktopId;
          this.sessions.set(desktopId, pending.session);
          // Log derived key prefix for debugging key mismatch
          const keyHex = Array.from(pending.session.derivedKey as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
          console.log(`[relay] Stored E2EE session for ${desktopId}, derivedKey prefix: ${keyHex.slice(0, 16)}...`);
          delete (this as any)._pendingSession;

          // Persist E2EE session for app restarts
          this.saveE2EESessions();

          // Add/update desktop in list
          this.desktops = this.desktops.map(d =>
            d.desktopId === desktopId ? { ...d, online: true } : d
          );
          if (!this.desktops.find(d => d.desktopId === desktopId)) {
            this.desktops.push({
              desktopId,
              deviceName: msg.desktopDeviceName || 'Desktop',
              online: true,
            });
          }
          this.emitState();

          for (const h of this.eventHandlers) {
            h('pairing-accepted', { desktopId });
          }
        }
        break;
      }

      case 'pairing-revoked': {
        const deviceId = msg.deviceId as string;
        this.sessions.delete(deviceId);
        this.desktops = this.desktops.filter(d => d.desktopId !== deviceId);
        if (this.controllingDesktopId === deviceId) {
          this.controllingDesktopId = null;
        }
        this.saveE2EESessions();
        this.emitState();
        break;
      }

      case 'relay': {
        this.handleEncryptedRelay(msg);
        break;
      }

      case 'control-ack': {
        if (msg.accepted) {
          this.controllingDesktopId = msg.from;
        }
        this.emitState();
        for (const h of this.eventHandlers) {
          h('control-ack', { accepted: msg.accepted, from: msg.from });
        }
        break;
      }

      case 'control-revoked': {
        this.controllingDesktopId = null;
        this.emitState();
        for (const h of this.eventHandlers) {
          h('control-revoked', { from: msg.from });
        }
        break;
      }

      case 'device-online': {
        const id = msg.deviceId as string;
        this.desktops = this.desktops.map(d =>
          d.desktopId === id ? { ...d, online: true } : d
        );
        this.emitState();
        break;
      }

      case 'device-offline': {
        const id = msg.deviceId as string;
        this.desktops = this.desktops.map(d =>
          d.desktopId === id ? { ...d, online: false } : d
        );
        if (this.controllingDesktopId === id) {
          this.controllingDesktopId = null;
          for (const h of this.eventHandlers) {
            h('desktop-disconnected', { desktopId: id });
          }
        }
        this.emitState();
        break;
      }

      case 'error': {
        console.warn('[relay] Server error:', msg.message);
        for (const h of this.eventHandlers) {
          h('error', { message: msg.message });
        }
        break;
      }
    }
  }

  private handleEncryptedRelay(msg: any): void {
    const from = msg.from as string;
    const session = this.sessions.get(from);
    if (!session) return;

    try {
      const plaintext = decrypt(session, msg.payload, msg.seq);
      const parsed = JSON.parse(plaintext);

      if (parsed.type === 'response') {
        const pending = this.pendingCommands.get(parsed.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(parsed.id);
          if (parsed.error) {
            pending.reject(new Error(parsed.error));
          } else {
            pending.resolve(parsed.result);
          }
        }
      } else if (parsed.type === 'event') {
        for (const h of this.eventHandlers) {
          h(parsed.channel, parsed.data);
        }
      }
    } catch (err) {
      console.error('[relay] Decrypt error:', err);
    }
  }

  // ─── Listeners ─────────────────────────────────────────────────

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  private emitState(): void {
    const state = this.getState();
    for (const h of this.stateHandlers) {
      h(state);
    }
  }
}

// Singleton
export const relayClient = new MobileRelayClient();
