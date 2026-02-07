import { create } from 'zustand';
import type {
  Message,
  SessionInfo,
  GitStatus,
  PanelState,
  CurrentSession,
} from '../types';

interface AppStore {
  // Current session state
  currentSession: CurrentSession;
  sessions: SessionInfo[];
  panels: PanelState;
  currentProject: {
    path: string;
    name: string;
    branch: string;
  };
  streamingContent: string;
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

  // Project actions
  setCurrentProject: (project: { path: string; name: string; branch?: string }) => void;
  setBranch: (branch: string) => void;

  // Streaming
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;

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
  },
  currentProject: {
    path: '',
    name: '',
    branch: '',
  },
  streamingContent: '',
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

  // Git
  setGitStatus: (status) => set({ gitStatus: status }),

  // Platform
  setPlatform: (platform) => set({ platform }),
}));
