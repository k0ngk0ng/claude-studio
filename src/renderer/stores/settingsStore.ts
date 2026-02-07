import { create } from 'zustand';
import type {
  AppSettings,
  SettingsTab,
  GeneralSettings,
  ModelSettings,
  PermissionSettings,
  McpServer,
  GitSettings,
  AppearanceSettings,
  KeyBinding,
} from '../types';

const STORAGE_KEY = 'claude-app-settings';

const defaultSettings: AppSettings = {
  general: {
    sendKey: 'enter',
    autoApprove: 'suggest',
    showCostInfo: true,
    notifyOnComplete: true,
    preventSleep: false,
  },
  model: {
    defaultModel: 'claude-sonnet-4-20250514',
    maxTokens: 16384,
    temperature: 0,
    systemPrompt: '',
  },
  permissions: {
    allowFileWrite: true,
    allowFileRead: true,
    allowBash: true,
    allowMcp: true,
    disallowedCommands: ['rm -rf /', 'format', 'mkfs'],
  },
  mcpServers: [],
  git: {
    autoStage: false,
    showDiffOnCommit: true,
    defaultCommitPrefix: '',
    autoPush: false,
  },
  appearance: {
    theme: 'dark',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    editorFontSize: 13,
    editorFontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
    showLineNumbers: true,
    opaqueBackground: false,
  },
  keybindings: [
    { id: 'new-thread', label: 'New Thread', keys: '⌘N', action: 'newThread' },
    { id: 'toggle-terminal', label: 'Toggle Terminal', keys: '⌘T', action: 'toggleTerminal' },
    { id: 'toggle-diff', label: 'Toggle Diff Panel', keys: '⌘D', action: 'toggleDiff' },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', keys: '⌘B', action: 'toggleSidebar' },
    { id: 'settings', label: 'Open Settings', keys: '⌘,', action: 'openSettings' },
    { id: 'send-message', label: 'Send Message', keys: 'Enter', action: 'sendMessage' },
    { id: 'new-line', label: 'New Line in Input', keys: 'Shift+Enter', action: 'newLine' },
  ],
};

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Deep merge with defaults to handle new settings added in updates
      return {
        general: { ...defaultSettings.general, ...parsed.general },
        model: { ...defaultSettings.model, ...parsed.model },
        permissions: { ...defaultSettings.permissions, ...parsed.permissions },
        mcpServers: parsed.mcpServers || defaultSettings.mcpServers,
        git: { ...defaultSettings.git, ...parsed.git },
        appearance: { ...defaultSettings.appearance, ...parsed.appearance },
        keybindings: parsed.keybindings?.length ? parsed.keybindings : defaultSettings.keybindings,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...defaultSettings };
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

interface SettingsStore {
  // State
  isOpen: boolean;
  activeTab: SettingsTab;
  settings: AppSettings;

  // Navigation
  openSettings: () => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;

  // Update settings
  updateGeneral: (updates: Partial<GeneralSettings>) => void;
  updateModel: (updates: Partial<ModelSettings>) => void;
  updatePermissions: (updates: Partial<PermissionSettings>) => void;
  updateGit: (updates: Partial<GitSettings>) => void;
  updateAppearance: (updates: Partial<AppearanceSettings>) => void;
  updateKeybinding: (id: string, keys: string) => void;

  // MCP Servers
  addMcpServer: (server: McpServer) => void;
  updateMcpServer: (id: string, updates: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;
  toggleMcpServer: (id: string) => void;

  // Reset
  resetSettings: () => void;
  resetSection: (section: keyof AppSettings) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  isOpen: false,
  activeTab: 'general',
  settings: loadSettings(),

  openSettings: () => set({ isOpen: true, activeTab: 'general' }),
  closeSettings: () => set({ isOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  updateGeneral: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        general: { ...state.settings.general, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateModel: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        model: { ...state.settings.model, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updatePermissions: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        permissions: { ...state.settings.permissions, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateGit: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        git: { ...state.settings.git, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateAppearance: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        appearance: { ...state.settings.appearance, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateKeybinding: (id, keys) => {
    set((state) => {
      const newKeybindings = state.settings.keybindings.map((kb) =>
        kb.id === id ? { ...kb, keys } : kb
      );
      const newSettings = { ...state.settings, keybindings: newKeybindings };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  addMcpServer: (server) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        mcpServers: [...state.settings.mcpServers, server],
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateMcpServer: (id, updates) => {
    set((state) => {
      const newServers = state.settings.mcpServers.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      const newSettings = { ...state.settings, mcpServers: newServers };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  removeMcpServer: (id) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        mcpServers: state.settings.mcpServers.filter((s) => s.id !== id),
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  toggleMcpServer: (id) => {
    set((state) => {
      const newServers = state.settings.mcpServers.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      );
      const newSettings = { ...state.settings, mcpServers: newServers };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  resetSettings: () => {
    const fresh = { ...defaultSettings };
    saveSettings(fresh);
    set({ settings: fresh });
  },

  resetSection: (section) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        [section]: (defaultSettings as unknown as Record<string, unknown>)[section],
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },
}));
