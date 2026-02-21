/**
 * Remote Control — manages the control state machine for desktop ↔ mobile.
 *
 * States:
 * - local:     Normal desktop usage, no remote control active
 * - remote:    Mobile device has control, desktop is locked
 * - unlocking: Desktop user is entering unlock password
 *
 * Flow:
 * 1. Mobile sends control-request → desktop enters 'remote' mode (locked)
 * 2. Desktop user enters 6-digit password → if correct, reverts to 'local'
 * 3. Mobile receives control-revoked → kicked back to desktop list
 */

import { EventEmitter } from 'events';
import { relayClient } from './relay-client';

export type ControlMode = 'local' | 'remote' | 'unlocking';

interface RemoteControlState {
  mode: ControlMode;
  controllingDeviceId: string | null;
  controllingDeviceName: string | null;
}

export class RemoteControl extends EventEmitter {
  private state: RemoteControlState = {
    mode: 'local',
    controllingDeviceId: null,
    controllingDeviceName: null,
  };

  private lockPassword = '666666';
  private allowRemoteControl = true;
  private autoLockTimeout = 0;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.setupRelayListeners();
  }

  // ─── Configuration ───────────────────────────────────────────────

  updateSettings(settings: {
    lockPassword?: string;
    allowRemoteControl?: boolean;
    autoLockTimeout?: number;
  }): void {
    if (settings.lockPassword !== undefined) this.lockPassword = settings.lockPassword;
    if (settings.allowRemoteControl !== undefined) this.allowRemoteControl = settings.allowRemoteControl;
    if (settings.autoLockTimeout !== undefined) this.autoLockTimeout = settings.autoLockTimeout;
  }

  // ─── State access ────────────────────────────────────────────────

  getState(): RemoteControlState {
    return { ...this.state };
  }

  getMode(): ControlMode {
    return this.state.mode;
  }

  isLocked(): boolean {
    return this.state.mode === 'remote' || this.state.mode === 'unlocking';
  }

  // ─── Control flow ────────────────────────────────────────────────

  /**
   * Handle incoming control request from a mobile device.
   */
  handleControlRequest(deviceId: string, deviceName: string): void {
    if (!this.allowRemoteControl) {
      // Reject — remote control disabled
      relayClient.sendControlAck(deviceId, false);
      return;
    }

    if (this.state.mode !== 'local') {
      // Already controlled by another device
      relayClient.sendControlAck(deviceId, false);
      return;
    }

    // Verify we have a valid E2EE session — without it, we can't decrypt commands
    if (!relayClient.hasSession(deviceId)) {
      console.warn(`[remote-control] Rejecting control request from ${deviceName} (${deviceId}) — no E2EE session, re-pairing required`);
      relayClient.sendControlAck(deviceId, false);
      return;
    }

    // Accept control request
    relayClient.sendControlAck(deviceId, true);

    // Apply auto-lock timeout
    if (this.autoLockTimeout > 0) {
      this.lockTimer = setTimeout(() => {
        this.enterRemoteMode(deviceId, deviceName);
      }, this.autoLockTimeout);
    } else {
      this.enterRemoteMode(deviceId, deviceName);
    }
  }

  private enterRemoteMode(deviceId: string, deviceName: string): void {
    this.state = {
      mode: 'remote',
      controllingDeviceId: deviceId,
      controllingDeviceName: deviceName,
    };

    this.resetInactivityTimer();
    this.emitStateChange();
    console.log(`[remote-control] Entered remote mode — controlled by ${deviceName} (${deviceId})`);
  }

  /**
   * Attempt to unlock the desktop with a password.
   * Returns true if unlock succeeded.
   */
  tryUnlock(password: string): boolean {
    if (this.state.mode !== 'remote' && this.state.mode !== 'unlocking') {
      return true; // Already unlocked
    }

    // Transition to unlocking state on first attempt
    if (this.state.mode === 'remote') {
      this.state.mode = 'unlocking';
      this.emitStateChange();
    }

    if (password === this.lockPassword) {
      // Unlock successful — notify mobile device
      const deviceId = this.state.controllingDeviceId;
      if (deviceId) {
        relayClient.sendControlRevoked(deviceId);
      }

      this.clearInactivityTimer();
      this.state = {
        mode: 'local',
        controllingDeviceId: null,
        controllingDeviceName: null,
      };

      this.emitStateChange();
      console.log('[remote-control] Desktop unlocked');
      return true;
    }

    // Wrong password — stay in unlocking mode
    console.log('[remote-control] Unlock failed — wrong password');
    return false;
  }

  /**
   * Force release control (e.g., when mobile disconnects).
   */
  forceRelease(): void {
    if (this.state.mode === 'local') return;

    this.clearLockTimer();
    this.clearInactivityTimer();
    this.state = {
      mode: 'local',
      controllingDeviceId: null,
      controllingDeviceName: null,
    };

    this.emitStateChange();
    console.log('[remote-control] Control force-released');
  }

  // ─── Relay event listeners ───────────────────────────────────────

  private setupRelayListeners(): void {
    relayClient.on('control-request', (deviceId: string, deviceName: string) => {
      this.handleControlRequest(deviceId, deviceName);
    });

    relayClient.on('control-release', (deviceId: string) => {
      if (this.state.controllingDeviceId === deviceId) {
        this.forceRelease();
      }
    });

    relayClient.on('message', (from: string) => {
      // Any encrypted message from the controlling device resets the inactivity timer
      if (this.state.mode !== 'local' && this.state.controllingDeviceId === from) {
        this.resetInactivityTimer();
      }
    });

    relayClient.on('device-offline', (deviceId: string) => {
      // If the controlling device goes offline, release control
      if (this.state.controllingDeviceId === deviceId) {
        this.forceRelease();
      }
    });

    relayClient.on('pairing-revoked', (deviceId: string) => {
      // If the controlling device's pairing is revoked, release control
      if (this.state.controllingDeviceId === deviceId) {
        this.forceRelease();
      }
    });

    relayClient.on('disconnected', () => {
      // If we lose connection to relay, release control
      if (this.state.mode !== 'local') {
        this.forceRelease();
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private clearLockTimer(): void {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      if (this.state.mode !== 'local') {
        console.log('[remote-control] Inactivity timeout — auto-releasing control');
        this.forceRelease();
      }
    }, RemoteControl.INACTIVITY_TIMEOUT);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private emitStateChange(): void {
    // Only emit on EventEmitter — the IPC handlers listen for this
    // and send the canonical state shape to the renderer.
    this.emit('state-changed', this.getState());
  }
}

// Singleton
export const remoteControl = new RemoteControl();
