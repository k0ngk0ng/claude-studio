/**
 * Remote store — manages relay connection and remote control state.
 */

import { create } from 'zustand';
import { Alert } from 'react-native';
import { relayClient, type RelayState } from '../services/relay';
import type { DesktopInfo, Message, SessionInfo } from '../types';

interface RemoteStore {
  // Connection
  connected: boolean;
  desktops: DesktopInfo[];

  // Active control
  controllingDesktopId: string | null;
  controllingDesktopName: string | null;

  // Chat state (for active desktop)
  messages: Message[];
  isStreaming: boolean;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  activeProcessId: string | null; // Claude SDK process ID on desktop

  // Actions
  connect: () => Promise<boolean>;
  disconnect: () => void;
  selectDesktop: (desktopId: string) => Promise<void>;
  releaseDesktop: () => void;
  sendMessage: (content: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  executeCommand: (channel: string, args?: unknown[]) => Promise<any>;

  // Internal
  setRelayState: (state: RelayState) => void;
  addMessage: (msg: Message) => void;
}

export const useRemoteStore = create<RemoteStore>((set, get) => ({
  connected: false,
  desktops: [],
  controllingDesktopId: null,
  controllingDesktopName: null,
  messages: [],
  isStreaming: false,
  sessions: [],
  currentSessionId: null,
  activeProcessId: null,

  connect: async () => {
    const success = await relayClient.connect();
    if (success) {
      const state = relayClient.getState();
      set({
        connected: state.connected,
        desktops: state.desktops,
      });
    }
    return success;
  },

  disconnect: () => {
    relayClient.disconnect();
    set({
      connected: false,
      desktops: [],
      controllingDesktopId: null,
      controllingDesktopName: null,
      messages: [],
      sessions: [],
      currentSessionId: null,
      activeProcessId: null,
    });
  },

  selectDesktop: async (desktopId: string) => {
    const desktop = get().desktops.find(d => d.desktopId === desktopId);
    if (!desktop?.online) return;

    // Check if we have an E2EE session for this desktop
    if (!relayClient.hasSession(desktopId)) {
      throw new Error('NO_SESSION');
    }

    // Request control and wait for ack
    relayClient.requestControl(desktopId);

    const ack = await new Promise<{ accepted: boolean }>((resolve) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve({ accepted: false });
      }, 10000);

      const unsub = relayClient.onEvent((event, data) => {
        if (event === 'control-ack') {
          clearTimeout(timeout);
          unsub();
          resolve({ accepted: !!data?.accepted });
        }
      });
    });

    if (!ack.accepted) {
      // Desktop rejected or timed out — don't destroy pairing, just inform user
      Alert.alert(
        'Control Rejected',
        'Desktop did not accept the connection. It may be busy or offline. Try again.',
        [{ text: 'OK' }],
      );
      return;
    }

    set({
      controllingDesktopId: desktopId,
      controllingDesktopName: desktop.deviceName,
      messages: [],
      sessions: [],
      currentSessionId: null,
    });

    // Load sessions from desktop — if this fails, keys are likely out of sync
    try {
      await get().loadSessions();
    } catch (err: any) {
      if (err?.message?.includes('timeout') || err?.message?.includes('re-pairing')) {
        // E2EE keys are out of sync — release and prompt re-pair
        set({
          controllingDesktopId: null,
          controllingDesktopName: null,
        });
        await relayClient.forgetDesktop(desktopId);
        Alert.alert(
          'Connection Failed',
          'Encryption keys are out of sync. Please scan the QR code on the desktop again to re-pair.',
          [{ text: 'OK' }],
        );
        return;
      }
      throw err;
    }
  },

  releaseDesktop: () => {
    // Kill active Claude process if any
    const { activeProcessId } = get();
    if (activeProcessId) {
      get().executeCommand('claude:kill', [activeProcessId]).catch(() => {});
    }
    set({
      controllingDesktopId: null,
      controllingDesktopName: null,
      messages: [],
      sessions: [],
      currentSessionId: null,
      isStreaming: false,
      activeProcessId: null,
    });
  },

  sendMessage: async (content: string) => {
    const { controllingDesktopId } = get();
    if (!controllingDesktopId) return;

    // Add user message locally
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    set(s => ({ messages: [...s.messages, userMsg], isStreaming: true }));

    try {
      let processId = get().activeProcessId;

      // Helper: spawn a new Claude process
      const spawnProcess = async (): Promise<string> => {
        const sessionId = get().currentSessionId;
        const session = get().sessions.find(s => s.id === sessionId);
        const cwd = session?.projectPath || await get().executeCommand('app:getProjectPath');
        const pid = await get().executeCommand('claude:spawn', [
          cwd,
          sessionId || undefined,
          'bypassPermissions',
        ]) as string;
        set({ activeProcessId: pid });
        return pid;
      };

      // Spawn a Claude process if we don't have one yet
      if (!processId) {
        processId = await spawnProcess();
      }

      // Send message — if it returns false, the process has ended (result received),
      // so we need to spawn a new one and retry.
      const sent = await get().executeCommand('claude:send', [processId, content]);
      if (!sent) {
        processId = await spawnProcess();
        await get().executeCommand('claude:send', [processId, content]);
      }
    } catch (err: any) {
      set(s => ({
        isStreaming: false,
        messages: [...s.messages, {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Failed to send: ${err.message}`,
          timestamp: new Date().toISOString(),
        }],
      }));
    }
  },

  loadSessions: async () => {
    try {
      const rawSessions = await get().executeCommand('sessions:list');
      console.log('[remoteStore] loadSessions raw result:', JSON.stringify(rawSessions)?.slice(0, 500));
      // Desktop returns SessionInfo with { id, projectPath, projectName, title, lastMessage, updatedAt }
      // Mobile expects { id, title, lastMessage, timestamp, projectPath }
      const sessions: SessionInfo[] = ((rawSessions as any[]) || []).map((s: any) => ({
        id: s.id,
        title: s.title || s.projectName || 'Untitled',
        lastMessage: s.lastMessage,
        timestamp: s.updatedAt || '',
        projectPath: s.projectPath || '',
      }));
      console.log('[remoteStore] loadSessions mapped:', sessions.length, 'sessions');
      set({ sessions });
    } catch (err: any) {
      console.error('[remoteStore] loadSessions error:', err?.message || err);
      set({ sessions: [] });
    }
  },

  selectSession: async (sessionId: string) => {
    const { controllingDesktopId } = get();
    if (!controllingDesktopId) return;

    // Kill previous Claude process if any
    const { activeProcessId } = get();
    if (activeProcessId) {
      get().executeCommand('claude:kill', [activeProcessId]).catch(() => {});
    }

    set({ currentSessionId: sessionId, messages: [], activeProcessId: null });

    try {
      // Find the projectPath for this session from the sessions list
      const session = get().sessions.find(s => s.id === sessionId);
      const projectPath = session?.projectPath || await get().executeCommand('app:getProjectPath');
      const rawMessages = await get().executeCommand('sessions:getMessages', [projectPath, sessionId]);

      // Desktop returns JSONL MessageEntry[] format:
      //   { type: "user"|"assistant", message: { role, content }, uuid, timestamp }
      // Convert to mobile Message[] format:
      //   { id, role, content, timestamp }
      const messages: Message[] = [];
      if (Array.isArray(rawMessages)) {
        for (const entry of rawMessages as any[]) {
          if (!entry.message?.role || !entry.message?.content) continue;
          // Only include user and assistant messages
          const role = entry.message.role;
          if (role !== 'user' && role !== 'assistant') continue;

          // Extract text content (can be string or content blocks array)
          let content = '';
          if (typeof entry.message.content === 'string') {
            content = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            content = entry.message.content
              .filter((b: any) => b.type === 'text' && b.text)
              .map((b: any) => b.text)
              .join('\n');
          }
          if (!content) continue;

          messages.push({
            id: entry.uuid || `msg-${messages.length}`,
            role,
            content,
            timestamp: entry.timestamp || new Date().toISOString(),
          });
        }
      }
      set({ messages });
    } catch {
      // Ignore
    }
  },

  executeCommand: async (channel: string, args: unknown[] = []) => {
    const { controllingDesktopId } = get();
    if (!controllingDesktopId) throw new Error('No desktop connected');
    return relayClient.executeCommand(controllingDesktopId, channel, args);
  },

  setRelayState: (state) => {
    set({
      connected: state.connected,
      desktops: state.desktops,
    });

    // If controlling desktop went offline, release
    // Only release if the desktop is confirmed offline in the device list
    // (don't release just because relay's controllingDesktopId is null —
    //  that field tracks the relay's own state, not our app-level selection)
    const current = get().controllingDesktopId;
    if (current) {
      const desktop = state.desktops.find(d => d.desktopId === current);
      if (desktop && !desktop.online) {
        get().releaseDesktop();
      }
    }
  },

  addMessage: (msg) => {
    set(s => ({ messages: [...s.messages, msg] }));
  },
}));

// ─── Initialize relay event listeners ────────────────────────────────

export function initRelayListeners(): () => void {
  const unsubState = relayClient.onStateChange((state) => {
    useRemoteStore.getState().setRelayState(state);
  });

  const unsubEvent = relayClient.onEvent((event, data) => {
    const store = useRemoteStore.getState();

    switch (event) {
      case 'control-revoked':
        // Desktop unlocked — kick back to list
        store.releaseDesktop();
        break;

      case 'desktop-disconnected':
        store.releaseDesktop();
        break;

      case 'claude:message': {
        // Streaming message from desktop (already converted to mobile format)
        const msg = data as any;
        if (msg?.role === 'assistant' || msg?.role === 'system') {
          store.addMessage({
            id: msg.id || `remote-${Date.now()}`,
            role: msg.role,
            content: msg.content || '',
            timestamp: msg.timestamp || new Date().toISOString(),
          });
        }
        break;
      }

      case 'claude:stream-end': {
        // Streaming finished — process has exited, clear activeProcessId
        // so next message will spawn a fresh process.
        useRemoteStore.setState({ isStreaming: false, activeProcessId: null });
        break;
      }
    }
  });

  return () => {
    unsubState();
    unsubEvent();
  };
}
