/**
 * WebSocket Relay — handles real-time communication between desktop and mobile clients.
 *
 * Endpoint: /ws/relay?token=xxx&deviceType=desktop|mobile&deviceId=xxx&deviceName=xxx
 *
 * Message types:
 *   Client → Server:
 *     - heartbeat           → responds with pong
 *     - register-pairing    → desktop registers a pairing code + ECDH public key
 *     - claim-pairing       → mobile claims a pairing code
 *     - relay               → forward encrypted message to target device
 *     - revoke-pairing      → remove a paired device
 *     - control-ack         → desktop accepts/rejects control request
 *     - control-release     → mobile releases control of desktop
 *     - control-revoked     → desktop revokes mobile control
 *
 *   Server → Client:
 *     - pong                → heartbeat response
 *     - pairing-accepted    → pairing completed (sent to both sides)
 *     - pairing-revoked     → pairing removed
 *     - relay               → forwarded encrypted message
 *     - device-online       → paired device came online
 *     - device-offline      → paired device went offline
 *     - control-request     → mobile requesting control (forwarded to desktop)
 *     - control-release     → mobile releasing control (forwarded to desktop)
 *     - control-ack         → desktop response to control request
 *     - control-revoked     → desktop revoked control
 *     - device-list         → list of online desktops for mobile
 *     - error               → error message
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { verifyToken } from './auth.js';
import { getUserById } from './db.js';

// ─── Types ───────────────────────────────────────────────────────────

interface ConnectedDevice {
  ws: WebSocket;
  userId: string;
  deviceId: string;
  deviceType: 'desktop' | 'mobile';
  deviceName: string;
  connectedAt: number;
}

interface PairingEntry {
  pairingCode: string;
  desktopId: string;
  desktopPublicKey: string;
  deviceName: string;
  userId: string;
  createdAt: number;
}

interface PairedRelation {
  desktopId: string;
  mobileId: string;
  userId: string;
  pairedAt: number;
}

// ─── State ───────────────────────────────────────────────────────────

// Connected devices keyed by deviceId
const devices = new Map<string, ConnectedDevice>();

// Pending pairing codes (TTL 5 minutes)
const pendingPairings = new Map<string, PairingEntry>();

// Active paired relations (desktopId ↔ mobileId)
const pairedRelations: PairedRelation[] = [];

// Cleanup interval for expired pairings
const PAIRING_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Setup ───────────────────────────────────────────────────────────

export function setupWebSocketRelay(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests
  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    // Only handle /ws/relay path
    if (url.pathname !== '/ws/relay') {
      socket.destroy();
      return;
    }

    // Extract query params
    const token = url.searchParams.get('token');
    const deviceType = url.searchParams.get('deviceType') as 'desktop' | 'mobile';
    const deviceId = url.searchParams.get('deviceId');
    const deviceName = decodeURIComponent(url.searchParams.get('deviceName') || 'Unknown');

    // Validate params
    if (!token || !deviceType || !deviceId || !['desktop', 'mobile'].includes(deviceType)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate
    const userId = await verifyToken(token);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = getUserById(userId);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete WebSocket upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, { userId, deviceId, deviceType, deviceName });
    });
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket, info: { userId: string; deviceId: string; deviceType: string; deviceName: string }) => {
    const { userId, deviceId, deviceType, deviceName } = info;

    // Close existing connection for same deviceId (reconnect scenario)
    const existing = devices.get(deviceId);
    if (existing) {
      try { existing.ws.close(1000, 'Replaced by new connection'); } catch {}
    }

    // Register device
    const device: ConnectedDevice = {
      ws,
      userId,
      deviceId,
      deviceType: deviceType as 'desktop' | 'mobile',
      deviceName,
      connectedAt: Date.now(),
    };
    devices.set(deviceId, device);

    console.log(`[relay] ${deviceType} connected: ${deviceName} (${deviceId}) user=${userId}`);

    // Notify paired devices that this device is online
    notifyPairedDevices(deviceId, userId, 'device-online');

    // If mobile, send list of online desktops for same user
    if (deviceType === 'mobile') {
      sendDesktopList(ws, userId);
    }

    // Handle messages
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(device, msg);
      } catch (err) {
        sendTo(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      devices.delete(deviceId);
      console.log(`[relay] ${deviceType} disconnected: ${deviceName} (${deviceId})`);

      // Notify paired devices
      notifyPairedDevices(deviceId, userId, 'device-offline');
    });

    ws.on('error', (err) => {
      console.error(`[relay] WebSocket error for ${deviceId}:`, err.message);
    });
  });

  // Cleanup expired pairings every minute
  setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of pendingPairings) {
      if (now - entry.createdAt > PAIRING_TTL) {
        pendingPairings.delete(code);
      }
    }
  }, 60_000);

  console.log('[relay] WebSocket relay initialized');
}

// ─── Message handling ────────────────────────────────────────────────

function handleMessage(device: ConnectedDevice, msg: any): void {
  switch (msg.type) {
    case 'heartbeat':
      sendTo(device.ws, { type: 'pong' });
      break;

    case 'register-pairing':
      handleRegisterPairing(device, msg);
      break;

    case 'claim-pairing':
      handleClaimPairing(device, msg);
      break;

    case 'relay':
      handleRelay(device, msg);
      break;

    case 'revoke-pairing':
      handleRevokePairing(device, msg);
      break;

    case 'control-request':
      handleControlRequest(device, msg);
      break;

    case 'control-ack':
      handleControlAck(device, msg);
      break;

    case 'control-release':
      handleControlRelease(device, msg);
      break;

    case 'control-revoked':
      handleControlRevoked(device, msg);
      break;

    default:
      sendTo(device.ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}

// ─── Pairing ─────────────────────────────────────────────────────────

function handleRegisterPairing(device: ConnectedDevice, msg: any): void {
  if (device.deviceType !== 'desktop') {
    sendTo(device.ws, { type: 'error', message: 'Only desktop can register pairing' });
    return;
  }

  const { pairingCode, publicKey, deviceName } = msg;
  if (!pairingCode || !publicKey) {
    sendTo(device.ws, { type: 'error', message: 'Missing pairingCode or publicKey' });
    return;
  }

  pendingPairings.set(pairingCode, {
    pairingCode,
    desktopId: device.deviceId,
    desktopPublicKey: publicKey,
    deviceName: deviceName || device.deviceName,
    userId: device.userId,
    createdAt: Date.now(),
  });

  console.log(`[relay] Pairing registered: ${pairingCode} by ${device.deviceId}`);
}

function handleClaimPairing(device: ConnectedDevice, msg: any): void {
  if (device.deviceType !== 'mobile') {
    sendTo(device.ws, { type: 'error', message: 'Only mobile can claim pairing' });
    return;
  }

  const { pairingCode, publicKey } = msg;
  if (!pairingCode || !publicKey) {
    sendTo(device.ws, { type: 'error', message: 'Missing pairingCode or publicKey' });
    return;
  }

  const entry = pendingPairings.get(pairingCode);
  if (!entry) {
    sendTo(device.ws, { type: 'error', message: 'Invalid or expired pairing code' });
    return;
  }

  // Verify same account
  if (entry.userId !== device.userId) {
    sendTo(device.ws, { type: 'error', message: 'Pairing code belongs to a different account' });
    return;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > PAIRING_TTL) {
    pendingPairings.delete(pairingCode);
    sendTo(device.ws, { type: 'error', message: 'Pairing code expired' });
    return;
  }

  // Create paired relation
  const existingIdx = pairedRelations.findIndex(
    r => r.desktopId === entry.desktopId && r.mobileId === device.deviceId
  );
  if (existingIdx >= 0) {
    pairedRelations.splice(existingIdx, 1);
  }

  pairedRelations.push({
    desktopId: entry.desktopId,
    mobileId: device.deviceId,
    userId: device.userId,
    pairedAt: Date.now(),
  });

  // Remove used pairing code
  pendingPairings.delete(pairingCode);

  // Notify desktop
  const desktop = devices.get(entry.desktopId);
  if (desktop) {
    sendTo(desktop.ws, {
      type: 'pairing-accepted',
      mobilePublicKey: publicKey,
      mobileDeviceId: device.deviceId,
      mobileDeviceName: device.deviceName,
    });
  }

  // Notify mobile
  sendTo(device.ws, {
    type: 'pairing-accepted',
    desktopId: entry.desktopId,
    desktopDeviceName: entry.deviceName,
    desktopPublicKey: entry.desktopPublicKey,
  });

  console.log(`[relay] Pairing completed: desktop=${entry.desktopId} ↔ mobile=${device.deviceId}`);
}

function handleRevokePairing(device: ConnectedDevice, msg: any): void {
  const { targetDeviceId } = msg;
  if (!targetDeviceId) return;

  // Remove relation
  const idx = pairedRelations.findIndex(
    r => (r.desktopId === device.deviceId && r.mobileId === targetDeviceId) ||
         (r.mobileId === device.deviceId && r.desktopId === targetDeviceId)
  );

  if (idx >= 0) {
    pairedRelations.splice(idx, 1);

    // Notify the other device
    const target = devices.get(targetDeviceId);
    if (target) {
      sendTo(target.ws, { type: 'pairing-revoked', deviceId: device.deviceId });
    }

    console.log(`[relay] Pairing revoked: ${device.deviceId} ↔ ${targetDeviceId}`);
  }
}

// ─── Relay (encrypted message forwarding) ────────────────────────────

function handleRelay(device: ConnectedDevice, msg: any): void {
  const { to, payload, seq } = msg;
  if (!to || !payload) {
    sendTo(device.ws, { type: 'error', message: 'Missing relay target or payload' });
    return;
  }

  // Verify devices are paired
  const isPaired = pairedRelations.some(
    r => (r.desktopId === device.deviceId && r.mobileId === to) ||
         (r.mobileId === device.deviceId && r.desktopId === to)
  );

  if (!isPaired) {
    sendTo(device.ws, { type: 'error', message: 'Not paired with target device' });
    return;
  }

  // Forward to target
  const target = devices.get(to);
  if (!target) {
    sendTo(device.ws, { type: 'error', message: 'Target device is offline' });
    return;
  }

  sendTo(target.ws, {
    type: 'relay',
    from: device.deviceId,
    payload,
    seq,
  });
}

// ─── Remote control ──────────────────────────────────────────────────

function handleControlRequest(device: ConnectedDevice, msg: any): void {
  if (device.deviceType !== 'mobile') {
    sendTo(device.ws, { type: 'error', message: 'Only mobile can request control' });
    return;
  }

  const { targetDesktopId } = msg;
  if (!targetDesktopId) return;

  // Verify paired
  const isPaired = pairedRelations.some(
    r => r.desktopId === targetDesktopId && r.mobileId === device.deviceId
  );
  if (!isPaired) {
    sendTo(device.ws, { type: 'error', message: 'Not paired with target desktop' });
    return;
  }

  const desktop = devices.get(targetDesktopId);
  if (!desktop) {
    sendTo(device.ws, { type: 'error', message: 'Desktop is offline' });
    return;
  }

  // Forward control request to desktop
  sendTo(desktop.ws, {
    type: 'control-request',
    from: device.deviceId,
    deviceName: device.deviceName,
  });
}

function handleControlAck(device: ConnectedDevice, msg: any): void {
  const { to, accepted } = msg;
  if (!to) return;

  const target = devices.get(to);
  if (target) {
    sendTo(target.ws, {
      type: 'control-ack',
      from: device.deviceId,
      accepted,
    });
  }
}

function handleControlRelease(device: ConnectedDevice, msg: any): void {
  const { targetDesktopId } = msg;
  if (!targetDesktopId) return;

  const desktop = devices.get(targetDesktopId);
  if (desktop) {
    sendTo(desktop.ws, {
      type: 'control-release',
      from: device.deviceId,
    });
  }
}

function handleControlRevoked(device: ConnectedDevice, msg: any): void {
  const { to } = msg;
  if (!to) return;

  const target = devices.get(to);
  if (target) {
    sendTo(target.ws, {
      type: 'control-revoked',
      from: device.deviceId,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sendTo(ws: WebSocket, msg: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
}

function notifyPairedDevices(deviceId: string, userId: string, eventType: 'device-online' | 'device-offline'): void {
  // Find all paired relations involving this device
  for (const rel of pairedRelations) {
    if (rel.userId !== userId) continue;

    let targetId: string | null = null;
    if (rel.desktopId === deviceId) targetId = rel.mobileId;
    else if (rel.mobileId === deviceId) targetId = rel.desktopId;

    if (targetId) {
      const target = devices.get(targetId);
      if (target) {
        sendTo(target.ws, { type: eventType, deviceId });
      }
    }
  }
}

function sendDesktopList(ws: WebSocket, userId: string): void {
  // Find all online desktops for this user that are paired with any mobile
  const desktops: { desktopId: string; deviceName: string; online: boolean }[] = [];
  const seen = new Set<string>();

  for (const rel of pairedRelations) {
    if (rel.userId !== userId || seen.has(rel.desktopId)) continue;
    seen.add(rel.desktopId);

    const desktop = devices.get(rel.desktopId);
    desktops.push({
      desktopId: rel.desktopId,
      deviceName: desktop?.deviceName || 'Unknown',
      online: !!desktop,
    });
  }

  sendTo(ws, { type: 'device-list', desktops });
}
