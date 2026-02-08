import { create } from 'zustand';
import type {
  Message,
  SessionInfo,
  GitStatus,
  PanelState,
  PanelSizes,
  CurrentSession,
} from '../types';

export interface ToolActivity {
  id: string;
  name: string;
  input?: string; // brief description of input
  inputFull?: string; // full JSON input
  output?: string; // tool result (truncated)
  status: 'running' | 'done';
  timestamp: number;
}

// Per-session runtime state (preserved when switching threads)
export interface SessionRuntime {
  processId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  toolActivities: ToolActivity[];
  messages: import('../types').Message[];
}

interface AppStore {
  // Current session state
  currentSession: CurrentSession;
  sessions: SessionInfo[];
  panels: PanelState;
  panelSizes: PanelSizes;
  currentProject: {
    path: string;
    name: string;
    branch: string;
  };
  streamingContent: string;
  toolActivities: ToolActivity[];
  // Per-session runtime cache (keyed by session id or processId)
  sessionRuntimes: Map<string, SessionRuntime>;
  isLoadingSession: boolean;
  gitStatus: GitStatus | null;
  platform: 'mac' | 'windows' | 'linux';

  // Session actions
  setCurrentSession: (session: Partial<CurrentSession>) => void;
  resetCurrentSession: () => void;
  addMessage: (message: Message) => void;
  updateLastAssistantMessage: (content: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setProcessId: (processId: string | null) => void;

  // Sessions list actions
  setSessions: (sessions: SessionInfo[]) => void;

  // Panel actions
  togglePanel: (panel: keyof PanelState) => void;
  setPanel: (panel: keyof PanelState, open: boolean) => void;
  setPanelSize: (panel: keyof PanelSizes, size: number) => void;

  // Project actions
  setCurrentProject: (project: { path: string; name: string; branch?: string }) => void;
  setBranch: (branch: string) => void;

  // Streaming
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;

  // Tool activities
  addToolActivity: (activity: ToolActivity) => void;
  updateToolActivity: (id: string, status: 'done') => void;
  clearToolActivities: () => void;

  // Session runtime save/restore
  saveCurrentRuntime: () => void;
  restoreRuntime: (sessionKey: string) => boolean;
  removeRuntime: (sessionKey: string) => void;

  // Loading
  setIsLoadingSession: (loading: boolean) => void;

  // Git
  setGitStatus: (status: GitStatus | null) => void;

  // Platform
  setPlatform: (platform: 'mac' | 'windows' | 'linux') => void;
}

const defaultSession: CurrentSession = {
  id: null,
  processId: null,
  projectPath: '',
  messages: [],
  isStreaming: false,
};

export const useAppStore = create<AppStore>((set, get) => ({
  currentSession: { ...defaultSession },
  sessions: [],
  panels: {
    sidebar: true,
    terminal: false,
    diff: false,
    logs: false,
  },
  panelSizes: {
    sidebar: 240,
    terminal: 250,
    diff: 400,
  },
  currentProject: {
    path: '',
    name: '',
    branch: '',
  },
  streamingContent: '',
  toolActivities: [],
  sessionRuntimes: new Map(),
  isLoadingSession: false,
  gitStatus: null,
  platform: 'mac',

  // Session actions
  setCurrentSession: (session) =>
    set((state) => ({
      currentSession: { ...state.currentSession, ...session },
    })),

  resetCurrentSession: () =>
    set({
      currentSession: { ...defaultSession },
      streamingContent: '',
      toolActivities: [],
    }),

  addMessage: (message) =>
    set((state) => ({
      currentSession: {
        ...state.currentSession,
        messages: [...state.currentSession.messages, message],
      },
    })),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const messages = [...state.currentSession.messages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
        messages[lastIdx] = { ...messages[lastIdx], content };
      }
      return {
        currentSession: { ...state.currentSession, messages },
      };
    }),

  setIsStreaming: (streaming) =>
    set((state) => ({
      currentSession: { ...state.currentSession, isStreaming: streaming },
    })),

  setProcessId: (processId) =>
    set((state) => ({
      currentSession: { ...state.currentSession, processId },
    })),

  // Sessions list
  setSessions: (sessions) => set({ sessions }),

  // Panels
  togglePanel: (panel) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: !state.panels[panel] },
    })),

  setPanel: (panel, open) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: open },
    })),

  setPanelSize: (panel, size) =>
    set((state) => ({
      panelSizes: { ...state.panelSizes, [panel]: size },
    })),

  // Project
  setCurrentProject: (project) =>
    set((state) => ({
      currentProject: {
        ...state.currentProject,
        ...project,
        branch: project.branch || state.currentProject.branch,
      },
    })),

  setBranch: (branch) =>
    set((state) => ({
      currentProject: { ...state.currentProject, branch },
    })),

  // Streaming
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content,
    })),
  clearStreamingContent: () => set({ streamingContent: '' }),

  // Tool activities
  addToolActivity: (activity) =>
    set((state) => ({
      toolActivities: [...state.toolActivities, activity],
    })),
  updateToolActivity: (id, status) =>
    set((state) => ({
      toolActivities: state.toolActivities.map((a) =>
        a.id === id ? { ...a, status } : a
      ),
    })),
  clearToolActivities: () => set({ toolActivities: [] }),

  // Session runtime save/restore
  saveCurrentRuntime: () => {
    const state = get();
    const key = state.currentSession.id || state.currentSession.processId;
    if (!key) return;
    // Only save if there's something worth saving (streaming or has a process)
    if (!state.currentSession.isStreaming && !state.currentSession.processId) return;
    const runtimes = new Map(state.sessionRuntimes);
    runtimes.set(key, {
      processId: state.currentSession.processId,
      isStreaming: state.currentSession.isStreaming,
      streamingContent: state.streamingContent,
      toolActivities: [...state.toolActivities],
      messages: [...state.currentSession.messages],
    });
    set({ sessionRuntimes: runtimes });
  },

  restoreRuntime: (sessionKey: string) => {
    const state = get();
    const runtime = state.sessionRuntimes.get(sessionKey);
    if (!runtime) return false;
    set({
      currentSession: {
        ...state.currentSession,
        id: sessionKey,
        processId: runtime.processId,
        isStreaming: runtime.isStreaming,
        messages: runtime.messages,
      },
      streamingContent: runtime.streamingContent,
      toolActivities: runtime.toolActivities,
    });
    return true;
  },

  removeRuntime: (sessionKey: string) => {
    const state = get();
    const runtimes = new Map(state.sessionRuntimes);
    runtimes.delete(sessionKey);
    set({ sessionRuntimes: runtimes });
  },

  // Loading
  setIsLoadingSession: (loading) => set({ isLoadingSession: loading }),

  // Git
  setGitStatus: (status) => set({ gitStatus: status }),

  // Platform
  setPlatform: (platform) => set({ platform }),
}));
