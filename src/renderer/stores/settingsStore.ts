import { create } from 'zustand';
import type {
  AppSettings,
  SettingsTab,
  GeneralSettings,
  ModelSettings,
  ProviderSettings,
  ProviderEnvVar,
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
    autoApprove: 'acceptEdits',
    language: 'auto',
    showCostInfo: true,
    notifyOnComplete: true,
    preventSleep: false,
    debugMode: false,
  },
  provider: {
    defaultModel: 'claude-sonnet-4-20250514',
    maxTokens: 16384,
    temperature: 0,
    systemPrompt: '',
    envVars: [],
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
    chatLayout: 'centered',
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

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // Migrate old 'model' key to 'provider' for backward compatibility
      const providerSource = parsed.provider || parsed.model || {};

      // Deep merge with defaults to handle new settings added in updates
      const settings: AppSettings = {
        general: { ...defaultSettings.general, ...parsed.general },
        provider: {
          ...defaultSettings.provider,
          ...providerSource,
          envVars: providerSource.envVars || defaultSettings.provider.envVars,
        },
        permissions: { ...defaultSettings.permissions, ...parsed.permissions },
        mcpServers: parsed.mcpServers || defaultSettings.mcpServers,
        git: { ...defaultSettings.git, ...parsed.git },
        appearance: { ...defaultSettings.appearance, ...parsed.appearance },
        keybindings: parsed.keybindings?.length ? parsed.keybindings : defaultSettings.keybindings,
      };

      // Migrate old autoApprove values to new permission mode values
      const modeMap: Record<string, string> = {
        'suggest': 'acceptEdits',
        'auto-edit': 'acceptEdits',
        'full-auto': 'bypassPermissions',
        'default': 'acceptEdits',
      };
      const validModes = ['acceptEdits', 'plan', 'bypassPermissions', 'dontAsk'];
      if (!validModes.includes(settings.general.autoApprove)) {
        settings.general.autoApprove = (modeMap[settings.general.autoApprove] || 'acceptEdits') as any;
        // Persist the migration
        saveSettings(settings);
      }

      return settings;
    }
  } catch {
    // Ignore parse errors
  }
  return { ...defaultSettings };
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
  updateProvider: (updates: Partial<ProviderSettings>) => void;
  updatePermissions: (updates: Partial<PermissionSettings>) => void;
  updateGit: (updates: Partial<GitSettings>) => void;
  updateAppearance: (updates: Partial<AppearanceSettings>) => void;
  updateKeybinding: (id: string, keys: string) => void;

  // Provider env vars
  setEnvVars: (envVars: ProviderEnvVar[]) => void;
  addEnvVar: (envVar: ProviderEnvVar) => void;
  removeEnvVar: (key: string) => void;
  updateEnvVar: (key: string, updates: Partial<ProviderEnvVar>) => void;

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

  updateProvider: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        provider: { ...state.settings.provider, ...updates },
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

  setEnvVars: (envVars) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        provider: { ...state.settings.provider, envVars },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  addEnvVar: (envVar) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: [...state.settings.provider.envVars, envVar],
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  removeEnvVar: (key) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: state.settings.provider.envVars.filter((v) => v.key !== key),
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateEnvVar: (key, updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: state.settings.provider.envVars.map((v) =>
            v.key === key ? { ...v, ...updates } : v
          ),
        },
      };
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
