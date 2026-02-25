import { create } from 'zustand';
import type { ControlMode, PairedDevice, RemoteState } from '../types';

interface RemoteStore {
  // State
  relayConnected: boolean;
  desktopId: string | null;
  controlMode: ControlMode;
  controllingDeviceId: string | null;
  controllingDeviceName: string | null;
  pairedDevices: PairedDevice[];
  qrDataUrl: string | null;
  isGeneratingQR: boolean;
  unlockError: string | null;

  // Actions
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  generateQR: () => Promise<string | null>;
  revokePairing: (deviceId: string) => Promise<boolean>;
  tryUnlock: (password: string) => Promise<boolean>;
  refreshState: () => Promise<void>;

  // Internal state setters (called from event listeners)
  setRemoteState: (state: Partial<RemoteStore>) => void;
}

export const useRemoteStore = create<RemoteStore>((set, get) => ({
  relayConnected: false,
  desktopId: null,
  controlMode: 'local',
  controllingDeviceId: null,
  controllingDeviceName: null,
  pairedDevices: [],
  qrDataUrl: null,
  isGeneratingQR: false,
  unlockError: null,

  connect: async () => {
    const token = await window.api.auth.loadToken();
    if (!token) return false;

    const success = await window.api.remote.connect(token);
    if (success) {
      set({ relayConnected: true });
      // Refresh full state from main process
      await get().refreshState();
    }
    return success;
  },

  disconnect: async () => {
    await window.api.remote.disconnect();
    set({
      relayConnected: false,
      controlMode: 'local',
      controllingDeviceId: null,
      controllingDeviceName: null,
      pairedDevices: [],
      qrDataUrl: null,
    });
  },

  generateQR: async () => {
    set({ isGeneratingQR: true });
    try {
      const dataUrl = await window.api.remote.generatePairingQR();
      set({ qrDataUrl: dataUrl, isGeneratingQR: false });
      return dataUrl;
    } catch {
      set({ isGeneratingQR: false });
      return null;
    }
  },

  revokePairing: async (deviceId: string) => {
    const success = await window.api.remote.revokePairing(deviceId);
    if (success) {
      set((state) => ({
        pairedDevices: state.pairedDevices.filter(d => d.deviceId !== deviceId),
      }));
    }
    return success;
  },

  tryUnlock: async (password: string) => {
    set({ unlockError: null });
    const success = await window.api.remote.unlock(password);
    if (success) {
      set({
        controlMode: 'local',
        controllingDeviceId: null,
        controllingDeviceName: null,
        unlockError: null,
      });
    } else {
      set({ unlockError: 'Wrong password' });
    }
    return success;
  },

  refreshState: async () => {
    try {
      const state = await window.api.remote.getState();
      if (state) {
        set({
          relayConnected: (state as any).relayConnected ?? false,
          desktopId: (state as any).desktopId ?? null,
          controlMode: (state as any).controlMode ?? 'local',
          controllingDeviceId: (state as any).controllingDeviceId ?? null,
          controllingDeviceName: (state as any).controllingDeviceName ?? null,
          pairedDevices: (state as any).pairedDevices ?? [],
        });
      }
    } catch {
      // Ignore refresh errors
    }
  },

  setRemoteState: (partial) => set(partial),
}));

// ─── Event listener setup (called once from App.tsx) ─────────────────

let listenersInitialized = false;

export function initRemoteListeners(): () => void {
  if (listenersInitialized) return () => {};
  listenersInitialized = true;

  const handleStateChanged = (state: unknown) => {
    const s = state as any;
    useRemoteStore.setState({
      relayConnected: s.relayConnected ?? false,
      desktopId: s.desktopId ?? null,
      controlMode: s.controlMode ?? 'local',
      controllingDeviceId: s.controllingDeviceId ?? null,
      controllingDeviceName: s.controllingDeviceName ?? null,
      pairedDevices: s.pairedDevices ?? [],
    });
  };

  const handleControlRequest = (deviceId: string, deviceName: string) => {
    // The main process handles the actual control flow.
    // We just update the UI state here.
    useRemoteStore.setState({
      controlMode: 'remote',
      controllingDeviceId: deviceId,
      controllingDeviceName: deviceName,
    });
  };

  window.api.remote.onStateChanged(handleStateChanged);
  window.api.remote.onControlRequest(handleControlRequest);

  return () => {
    window.api.remote.removeStateChangedListener(handleStateChanged);
    window.api.remote.removeControlRequestListener(handleControlRequest);
    listenersInitialized = false;
  };
}
