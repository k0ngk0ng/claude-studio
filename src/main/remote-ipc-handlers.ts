/**
 * IPC handlers for remote control features.
 *
 * Channels:
 * - remote:connect       — connect to relay server
 * - remote:disconnect    — disconnect from relay
 * - remote:generateQR    — generate pairing QR code
 * - remote:revokePairing — revoke a paired device
 * - remote:getPairedDevices — list paired devices
 * - remote:unlock        — attempt to unlock desktop
 * - remote:getState      — get current remote control state
 *
 * Events (main → renderer):
 * - remote:state-changed     — control state changed
 * - remote:control-request   — mobile requesting control
 * - remote:paired            — new device paired
 * - remote:message           — decrypted message from mobile
 */

import { ipcMain, BrowserWindow } from 'electron';
import { relayClient } from './relay-client';
import { remoteControl } from './remote-control';
import { claudeProcessManager } from './claude-process';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ─── Handler registry for remote command execution ───────────────────
// Instead of relying on Electron's internal _invokeHandlers,
// we maintain our own registry of handler functions.

type IpcHandler = (event: any, ...args: any[]) => any;
const handlerRegistry = new Map<string, IpcHandler>();

/**
 * Wrapper around ipcMain.handle that also registers the handler
 * in our own registry for remote command execution.
 */
function registerHandler(channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  handlerRegistry.set(channel, handler);
}

/**
 * Register an externally-defined IPC handler into our registry.
 * Call this for handlers registered elsewhere (e.g., ipc-handlers.ts).
 */
export function registerExternalHandler(channel: string, handler: IpcHandler): void {
  handlerRegistry.set(channel, handler);
}

/**
 * Invoke a handler from the registry directly (for remote commands).
 */
async function invokeHandler(channel: string, args: unknown[]): Promise<unknown> {
  const handler = handlerRegistry.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const fakeEvent = { sender: null } as any;
  return handler(fakeEvent, ...args);
}

function getServerUrl(): string {
  try {
    const settingsPath = path.join(os.homedir(), '.claude-studio', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (data?.server?.serverUrl) return data.server.serverUrl.replace(/\/+$/, '');
    }
  } catch { /* ignore */ }
  return process.env.CLAUDE_STUDIO_SERVER_URL || 'http://localhost:3456';
}

/** Read security settings from settings file and sync to remote-control module */
function syncSecuritySettings(): void {
  try {
    const settingsPath = path.join(os.homedir(), '.claude-studio', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (data?.security) {
        remoteControl.updateSettings({
          lockPassword: data.security.lockPassword,
          allowRemoteControl: data.security.allowRemoteControl,
          autoLockTimeout: data.security.autoLockTimeout,
        });
      }
    }
  } catch { /* ignore */ }
}

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return null;
  const wc = windows[0].webContents;
  return wc.isDestroyed() ? null : wc;
}

/** Canonical state shape — used everywhere to avoid inconsistencies */
function getFullState() {
  const controlState = remoteControl.getState();
  return {
    relayConnected: relayClient.isConnected(),
    controlMode: controlState.mode,
    controllingDeviceId: controlState.controllingDeviceId,
    controllingDeviceName: controlState.controllingDeviceName,
    pairedDevices: relayClient.getPairedDevices(),
  };
}

/** Send state to renderer via the canonical shape */
function emitStateToRenderer() {
  const wc = getWebContents();
  if (wc) {
    wc.send('remote:state-changed', getFullState());
  }
}

export function registerRemoteIpcHandlers(): void {
  // Load security settings from file on startup
  syncSecuritySettings();

  // Initialize Claude message forwarding to mobile devices
  initClaudeMessageForwarding();

  // ─── Connect to relay server ─────────────────────────────────────

  registerHandler('remote:connect', async (_event, token: string) => {
    try {
      if (!token) return false;

      const serverUrl = getServerUrl();
      // Use custom instance ID as deviceName if set (for development with multiple instances)
      const instanceId = process.env.CLAUDE_STUDIO_INSTANCE_ID;
      const deviceName = instanceId || os.hostname() || 'Desktop';

      const success = await relayClient.connect({
        serverUrl,
        token,
        deviceName,
      });

      return success;
    } catch (err: any) {
      console.error('[remote:connect] Error:', err.message);
      return false;
    }
  });

  // ─── Disconnect from relay ───────────────────────────────────────

  registerHandler('remote:disconnect', async () => {
    relayClient.disconnect();
  });

  // ─── Generate pairing QR code ────────────────────────────────────

  registerHandler('remote:generateQR', async () => {
    try {
      return await relayClient.generatePairingQR();
    } catch (err: any) {
      console.error('[remote:generateQR] Error:', err.message);
      return null;
    }
  });

  // ─── Revoke pairing ─────────────────────────────────────────────

  registerHandler('remote:revokePairing', async (_event, deviceId: string) => {
    try {
      return relayClient.revokePairing(deviceId);
    } catch {
      return false;
    }
  });

  // ─── Get paired devices ──────────────────────────────────────────

  registerHandler('remote:getPairedDevices', async () => {
    return relayClient.getPairedDevices();
  });

  // ─── Unlock desktop ──────────────────────────────────────────────

  registerHandler('remote:unlock', async (_event, password: string) => {
    return remoteControl.tryUnlock(password);
  });

  // ─── Get remote control state ────────────────────────────────────

  registerHandler('remote:getState', async () => {
    return getFullState();
  });

  // ─── Update security settings ────────────────────────────────────

  registerHandler('remote:updateSettings', async (_event, settings: {
    lockPassword?: string;
    allowRemoteControl?: boolean;
    autoLockTimeout?: number;
  }) => {
    remoteControl.updateSettings(settings);
    return true;
  });

  // ─── Forward relay events to renderer ────────────────────────────

  relayClient.on('connected', () => {
    emitStateToRenderer();
  });

  relayClient.on('disconnected', () => {
    emitStateToRenderer();
  });

  relayClient.on('paired', (device) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('remote:paired', device);
    }
    emitStateToRenderer();
  });

  relayClient.on('control-request', (deviceId: string, deviceName: string) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('remote:control-request', deviceId, deviceName);
    }
  });

  // Listen for remote-control state changes and forward to renderer
  remoteControl.on('state-changed', () => {
    emitStateToRenderer();
  });

  relayClient.on('message', (from: string, parsed: unknown) => {
    // Handle remote commands — execute IPC calls on behalf of mobile
    handleRemoteCommand(from, parsed);
  });

  relayClient.on('relay-error', (message: string) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('remote:error', message);
    }
  });
}

// ─── Remote command execution ──────────────────────────────────────

// Track which Claude processId belongs to which mobile device
// so we can forward streaming messages back via relay.
const processToDevice = new Map<string, string>();

/**
 * Extract text content from a Claude SDK message for mobile display.
 */
function extractMessageContent(message: any): { role: string; content: string } | null {
  if (!message?.message) return null;
  const { role, content } = message.message;
  if (role !== 'assistant') return null;

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b.type === 'text' && b.text)
      .map((b: any) => b.text)
      .join('\n');
  }
  if (!text) return null;
  return { role, content: text };
}

/**
 * Initialize forwarding of Claude streaming messages to mobile devices.
 * Called once during handler registration.
 */
function initClaudeMessageForwarding(): void {
  // Listen for all Claude messages and forward to the appropriate mobile device
  claudeProcessManager.on('message', (pid: string, message: unknown) => {
    const mobileDeviceId = processToDevice.get(pid);
    if (!mobileDeviceId) return; // Not a remote-spawned process

    const msg = message as any;

    // Forward assistant text messages
    if (msg.type === 'assistant') {
      const extracted = extractMessageContent(msg);
      if (extracted) {
        relayClient.sendEvent(mobileDeviceId, 'claude:message', {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: extracted.content,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Forward result (final response)
    if (msg.type === 'result' && msg.result) {
      let text = '';
      if (typeof msg.result === 'string') {
        text = msg.result;
      } else if (Array.isArray(msg.result)) {
        text = msg.result
          .filter((b: any) => b.type === 'text' && b.text)
          .map((b: any) => b.text)
          .join('\n');
      }
      // Signal streaming end
      relayClient.sendEvent(mobileDeviceId, 'claude:stream-end', {
        content: text || undefined,
      });
    }
  });

  // Clean up mapping when process exits
  claudeProcessManager.on('exit', (pid: string) => {
    const mobileDeviceId = processToDevice.get(pid);
    if (mobileDeviceId) {
      relayClient.sendEvent(mobileDeviceId, 'claude:stream-end', {});
      processToDevice.delete(pid);
    }
  });

  claudeProcessManager.on('error', (pid: string, errorMsg: string) => {
    const mobileDeviceId = processToDevice.get(pid);
    if (mobileDeviceId) {
      relayClient.sendEvent(mobileDeviceId, 'claude:message', {
        id: `err-${Date.now()}`,
        role: 'system',
        content: errorMsg,
        timestamp: new Date().toISOString(),
      });
      relayClient.sendEvent(mobileDeviceId, 'claude:stream-end', {});
      processToDevice.delete(pid);
    }
  });
}

/**
 * Execute a remote command from a mobile device.
 * This proxies IPC calls through the relay, allowing mobile to use
 * desktop features via E2EE encrypted messages.
 */
async function handleRemoteCommand(fromDeviceId: string, parsed: unknown): Promise<void> {
  const msg = parsed as { type: string; id?: string; channel?: string; args?: unknown[] };

  if (msg.type !== 'command' || !msg.id || !msg.channel) return;

  // Whitelist of allowed remote channels (exclude dangerous local-only operations)
  const ALLOWED_CHANNELS = new Set([
    // Claude
    'claude:spawn', 'claude:send', 'claude:kill',
    'claude:permission-response', 'claude:setPermissionMode',
    // Sessions
    'sessions:list', 'sessions:getMessages', 'sessions:listProjects', 'sessions:fork',
    // Git
    'git:status', 'git:diff', 'git:stage', 'git:unstage',
    'git:commit', 'git:branch', 'git:listBranches',
    'git:checkout', 'git:createBranch', 'git:push', 'git:pushTags',
    'git:log', 'git:showCommitFiles', 'git:showCommitFileDiff',
    'git:searchFiles', 'git:listFiles',
    // App info (read-only)
    'app:getProjectPath', 'app:getPlatform', 'app:getVersion',
    'app:getModel', 'app:getClaudeCodeVersion',
    // Settings (read-only)
    'settings:read',
    // Skills & Commands (read-only)
    'skills:list', 'commands:list',
  ]);

  if (!ALLOWED_CHANNELS.has(msg.channel)) {
    relayClient.sendResponse(fromDeviceId, msg.id, undefined, `Channel not allowed: ${msg.channel}`);
    return;
  }

  try {
    const result = await invokeHandler(msg.channel, msg.args || []);

    // Track processId → mobile device mapping for claude:spawn
    if (msg.channel === 'claude:spawn' && typeof result === 'string') {
      processToDevice.set(result, fromDeviceId);
    }

    // Clean up mapping when claude:kill is called
    if (msg.channel === 'claude:kill' && msg.args?.[0]) {
      processToDevice.delete(msg.args[0] as string);
    }

    relayClient.sendResponse(fromDeviceId, msg.id, result);
  } catch (err: any) {
    relayClient.sendResponse(fromDeviceId, msg.id, undefined, err.message || 'Unknown error');
  }
}
