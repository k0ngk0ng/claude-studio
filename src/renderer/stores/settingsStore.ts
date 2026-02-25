import { create } from 'zustand';
import { useDebugLogStore } from './debugLogStore';
import { useAuthStore } from './authStore';
import type {
  AppSettings,
  SettingsTab,
  GeneralSettings,
  ModelSettings,
  ProviderSettings,
  ProviderEnvVar,
  ClaudeCodeProfile,
  PermissionSettings,
  PermissionMode,
  McpServer,
  GitSettings,
  AppearanceSettings,
  KeyBinding,
  SecuritySettings,
  ServerSettings,
} from '../types';

const STORAGE_KEY = 'claude-studio-settings';

const DEFAULT_PROFILE_ID = 'default';

function createDefaultProfile(): ClaudeCodeProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    envVars: [],
    includeCoAuthoredBy: false,
    systemPrompt: '',
    temperature: 0,
  };
}

const defaultSettings: AppSettings = {
  general: {
    sendKey: 'enter',
    autoApprove: 'acceptEdits',
    language: 'auto',
    uiLanguage: 'auto',
    notifyOnComplete: true,
    preventSleep: false,
    debugMode: false,
    showArchivedThreads: false,
  },
  provider: {
    maxTokens: 16384,
    temperature: 0,
    systemPrompt: '',
    envVars: [],
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
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
    theme: 'system',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    editorFontSize: 13,
    editorFontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
    showLineNumbers: true,
    chatLayout: 'centered',
    streamingCursor: 'classic',
  },
  keybindings: [
    { id: 'new-thread', label: 'New Thread', keys: 'Cmd+N', action: 'newThread' },
    { id: 'toggle-terminal', label: 'Toggle Terminal', keys: 'Cmd+T', action: 'toggleTerminal' },
    { id: 'toggle-diff', label: 'Toggle Diff Panel', keys: 'Cmd+D', action: 'toggleDiff' },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', keys: 'Cmd+B', action: 'toggleSidebar' },
    { id: 'settings', label: 'Open Settings', keys: 'Cmd+,', action: 'openSettings' },
    { id: 'send-message', label: 'Send Message', keys: 'Enter', action: 'sendMessage' },
    { id: 'new-line', label: 'New Line in Input', keys: 'Shift+Enter', action: 'newLine' },
  ],
  security: {
    lockPassword: '666666',
    allowRemoteControl: true,
    autoLockTimeout: 0,
  },
  server: {
    serverUrl: '',
  },
};

function saveSettings(settings: AppSettings) {
  // Fire-and-forget write to ~/.claude-studio/settings.json
  window.api.settings.write(settings as unknown as Record<string, unknown>).catch(() => {
    // Ignore write errors
  });
  // Sync to server (debounced)
  syncToServer(settings);
}

// Debounced sync to server — excludes `server` section (local-only)
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncToServer(settings: AppSettings) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    // Exclude server config from sync
    const { server: _server, ...syncable } = settings;
    window.api.auth.setSettings(token, 'appSettings', syncable).catch(() => {});
  }, 1000);
}

/** Pull settings from server and merge with local */
export async function pullFromServer(): Promise<void> {
  const token = useAuthStore.getState().token;
  if (!token) return;
  try {
    const remote = await window.api.auth.getSettings(token);
    if (remote?.appSettings) {
      const remoteSettings = remote.appSettings as Record<string, unknown>;
      // Preserve local-only `server` section
      const localServer = useSettingsStore.getState().settings.server;
      const merged = mergeWithDefaults({ ...remoteSettings, server: localServer });
      // Save locally without triggering another server sync
      window.api.settings.write(merged as unknown as Record<string, unknown>).catch(() => {});
      useSettingsStore.setState({ settings: merged });
    } else {
      // Server has no settings yet — push current local settings to seed it
      const current = useSettingsStore.getState().settings;
      const { server: _server, ...syncable } = current;
      window.api.auth.setSettings(token, 'appSettings', syncable).catch(() => {});
    }
  } catch {
    // Ignore sync errors
  }
}

function mergeWithDefaults(parsed: Record<string, unknown>): AppSettings {
  // Migrate old 'model' key to 'provider' for backward compatibility
  const providerSource = (parsed.provider || parsed.model || {}) as Record<string, unknown>;

  // Deep merge with defaults to handle new settings added in updates
  const settings: AppSettings = {
    general: { ...defaultSettings.general, ...(parsed.general as Partial<GeneralSettings>) },
    provider: {
      ...defaultSettings.provider,
      ...(providerSource as Partial<ProviderSettings>),
      envVars: (providerSource.envVars as ProviderEnvVar[]) || defaultSettings.provider.envVars,
      profiles: (providerSource.profiles as ClaudeCodeProfile[]) || defaultSettings.provider.profiles,
      activeProfileId: (providerSource.activeProfileId as string) || defaultSettings.provider.activeProfileId,
    },
    permissions: { ...defaultSettings.permissions, ...(parsed.permissions as Partial<PermissionSettings>) },
    mcpServers: (parsed.mcpServers as McpServer[]) || defaultSettings.mcpServers,
    git: { ...defaultSettings.git, ...(parsed.git as Partial<GitSettings>) },
    appearance: { ...defaultSettings.appearance, ...(parsed.appearance as Partial<AppearanceSettings>) },
    keybindings: (parsed.keybindings as KeyBinding[])?.length ? (parsed.keybindings as KeyBinding[]) : defaultSettings.keybindings,
    security: { ...defaultSettings.security, ...(parsed.security as Partial<SecuritySettings>) },
    server: { ...defaultSettings.server, ...(parsed.server as Partial<ServerSettings>) },
  };

  // Migrate: if no profiles exist but envVars do, create default profile from envVars
  if (!providerSource.profiles && settings.provider.envVars.length > 0) {
    settings.provider.profiles = [{
      id: DEFAULT_PROFILE_ID,
      name: 'Default',
      envVars: [...settings.provider.envVars],
      includeCoAuthoredBy: false,
      systemPrompt: settings.provider.systemPrompt || '',
      temperature: settings.provider.temperature || 0,
    }];
    settings.provider.activeProfileId = DEFAULT_PROFILE_ID;
  }

  // Sync envVars from active profile
  const activeProfile = settings.provider.profiles.find(p => p.id === settings.provider.activeProfileId);
  if (activeProfile) {
    settings.provider.envVars = activeProfile.envVars;
  }

  // Migrate old autoApprove values to new permission mode values
  const modeMap: Record<string, string> = {
    'suggest': 'acceptEdits',
    'auto-edit': 'acceptEdits',
    'full-auto': 'bypassPermissions',
    'default': 'acceptEdits',
  };
  const validModes = ['acceptEdits', 'plan', 'bypassPermissions', 'dontAsk'];
  if (!validModes.includes(settings.general.autoApprove)) {
    settings.general.autoApprove = (modeMap[settings.general.autoApprove] || 'acceptEdits') as PermissionMode;
  }

  return settings;
}

/** Load settings from file, migrating from localStorage on first run */
async function loadSettingsFromFile(): Promise<AppSettings> {
  try {
    const fileData = await window.api.settings.read();
    if (fileData) {
      const settings = mergeWithDefaults(fileData);
      // Re-persist in case migrations changed anything
      saveSettings(settings);
      return settings;
    }

    // No file yet — check localStorage for data to migrate (try new key, then old key)
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('claude-app-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const settings = mergeWithDefaults(parsed);
        // Write migrated data to file
        saveSettings(settings);
        // Clean up both localStorage keys
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('claude-app-settings');
        return settings;
      }
    } catch {
      // Ignore localStorage errors
    }

    // No local data — seed defaults from ~/.claude/settings.json if available
    try {
      const claudeConfig = await window.api.claudeConfig.read();
      if (claudeConfig && typeof claudeConfig === 'object') {
        const env = claudeConfig.env as Record<string, string> | undefined;
        const envVars: ProviderEnvVar[] = env
          ? Object.entries(env).map(([key, value]) => ({ key, value, enabled: true }))
          : [];

        if (envVars.length > 0) {
          const seeded: AppSettings = { ...defaultSettings };
          const profile: ClaudeCodeProfile = {
            id: DEFAULT_PROFILE_ID,
            name: 'Default',
            envVars,
            includeCoAuthoredBy: !!claudeConfig.includeCoAuthoredBy,
            systemPrompt: '',
            temperature: 0,
          };
          seeded.provider = {
            ...seeded.provider,
            envVars,
            profiles: [profile],
            activeProfileId: DEFAULT_PROFILE_ID,
          };
          saveSettings(seeded);
          return seeded;
        }
      }
    } catch {
      // Ignore claude config read errors
    }
  } catch {
    // Ignore file read errors
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
  updateSecurity: (updates: Partial<SecuritySettings>) => void;
  updateServer: (updates: Partial<ServerSettings>) => void;
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

  // Profiles
  addProfile: (name: string) => string;
  removeProfile: (id: string) => void;
  renameProfile: (id: string, name: string) => void;
  switchProfile: (id: string) => void;
  duplicateProfile: (id: string) => string;
  updateActiveProfile: (updates: Partial<ClaudeCodeProfile>) => void;
  getActiveProfile: () => ClaudeCodeProfile;

  // Reset
  resetSettings: () => void;
  resetSection: (section: keyof AppSettings) => void;

  // Reload from file
  reloadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  isOpen: false,
  activeTab: 'general',
  settings: { ...defaultSettings },

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
      // Sync debug mode to debugLogStore
      if ('debugMode' in updates) {
        useDebugLogStore.getState().setDebugEnabled(!!updates.debugMode);
      }
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

  updateSecurity: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        security: { ...state.settings.security, ...updates },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateServer: (updates) => {
    set((state) => {
      const newSettings = {
        ...state.settings,
        server: { ...state.settings.server, ...updates },
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
      const activeId = state.settings.provider.activeProfileId;
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === activeId ? { ...p, envVars } : p
      );
      const newSettings = {
        ...state.settings,
        provider: { ...state.settings.provider, envVars, profiles: newProfiles },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  addEnvVar: (envVar) => {
    set((state) => {
      const newEnvVars = [...state.settings.provider.envVars, envVar];
      const activeId = state.settings.provider.activeProfileId;
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === activeId ? { ...p, envVars: newEnvVars } : p
      );
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: newEnvVars,
          profiles: newProfiles,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  removeEnvVar: (key) => {
    set((state) => {
      const newEnvVars = state.settings.provider.envVars.filter((v) => v.key !== key);
      const activeId = state.settings.provider.activeProfileId;
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === activeId ? { ...p, envVars: newEnvVars } : p
      );
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: newEnvVars,
          profiles: newProfiles,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  updateEnvVar: (key, updates) => {
    set((state) => {
      const newEnvVars = state.settings.provider.envVars.map((v) =>
        v.key === key ? { ...v, ...updates } : v
      );
      const activeId = state.settings.provider.activeProfileId;
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === activeId ? { ...p, envVars: newEnvVars } : p
      );
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          envVars: newEnvVars,
          profiles: newProfiles,
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

  addProfile: (name) => {
    const id = `profile-${Date.now()}`;
    const newProfile: ClaudeCodeProfile = {
      id,
      name,
      envVars: [],
      includeCoAuthoredBy: false,
      systemPrompt: '',
      temperature: 0,
    };
    set((state) => {
      // Save current envVars back to current profile before switching to new one
      const currentId = state.settings.provider.activeProfileId;
      const updatedProfiles = state.settings.provider.profiles.map((p) =>
        p.id === currentId ? { ...p, envVars: state.settings.provider.envVars } : p
      );
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          profiles: [...updatedProfiles, newProfile],
          activeProfileId: id,
          envVars: newProfile.envVars,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
    return id;
  },

  removeProfile: (id) => {
    set((state) => {
      const profiles = state.settings.provider.profiles;
      if (profiles.length <= 1) return state; // Can't remove last profile
      const newProfiles = profiles.filter((p) => p.id !== id);
      const isActive = state.settings.provider.activeProfileId === id;
      const newActiveId = isActive ? newProfiles[0].id : state.settings.provider.activeProfileId;
      const activeProfile = newProfiles.find((p) => p.id === newActiveId)!;
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          profiles: newProfiles,
          activeProfileId: newActiveId,
          envVars: activeProfile.envVars,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  renameProfile: (id, name) => {
    set((state) => {
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === id ? { ...p, name } : p
      );
      const newSettings = {
        ...state.settings,
        provider: { ...state.settings.provider, profiles: newProfiles },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  switchProfile: (id) => {
    set((state) => {
      // Save current envVars back to current profile before switching
      const currentId = state.settings.provider.activeProfileId;
      const updatedProfiles = state.settings.provider.profiles.map((p) =>
        p.id === currentId ? { ...p, envVars: state.settings.provider.envVars } : p
      );
      const targetProfile = updatedProfiles.find((p) => p.id === id);
      if (!targetProfile) return state;
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          profiles: updatedProfiles,
          activeProfileId: id,
          envVars: targetProfile.envVars,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  duplicateProfile: (id) => {
    const newId = `profile-${Date.now()}`;
    set((state) => {
      // Save current envVars back to current profile before switching
      const currentId = state.settings.provider.activeProfileId;
      const updatedProfiles = state.settings.provider.profiles.map((p) =>
        p.id === currentId ? { ...p, envVars: state.settings.provider.envVars } : p
      );
      const source = updatedProfiles.find((p) => p.id === id);
      if (!source) return state;
      const newProfile: ClaudeCodeProfile = {
        ...source,
        id: newId,
        name: `${source.name} (Copy)`,
        envVars: source.envVars.map((v) => ({ ...v })),
      };
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          profiles: [...updatedProfiles, newProfile],
          activeProfileId: newId,
          envVars: newProfile.envVars,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
    return newId;
  },

  updateActiveProfile: (updates) => {
    set((state) => {
      const activeId = state.settings.provider.activeProfileId;
      const newProfiles = state.settings.provider.profiles.map((p) =>
        p.id === activeId ? { ...p, ...updates } : p
      );
      const activeProfile = newProfiles.find((p) => p.id === activeId)!;
      const newSettings = {
        ...state.settings,
        provider: {
          ...state.settings.provider,
          profiles: newProfiles,
          envVars: activeProfile.envVars,
        },
      };
      saveSettings(newSettings);
      return { settings: newSettings };
    });
  },

  getActiveProfile: () => {
    const state = get();
    const activeId = state.settings.provider.activeProfileId;
    return state.settings.provider.profiles.find((p) => p.id === activeId) || state.settings.provider.profiles[0];
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

  reloadSettings: async () => {
    const settings = await loadSettingsFromFile();
    set({ settings });
  },
}));

// Async initialization: load settings from file (migrating from localStorage if needed)
loadSettingsFromFile().then((settings) => {
  useSettingsStore.setState({ settings });

  // Apply prevent sleep setting (if enabled in settings)
  if (settings.general.preventSleep) {
    window.api.app.preventSleep(true);
  }

  // Sync debug mode to debugLogStore (no circular dependency)
  if (settings.general.debugMode) {
    useDebugLogStore.getState().setDebugEnabled(true);
    // Emit initial log
    useDebugLogStore.getState().addLog({
      category: 'app',
      message: 'Debug mode enabled — settings loaded from file',
      level: 'info',
    });
    console.log('[debug:app] Debug mode enabled — settings loaded from file');
  }

  // Pull settings from server once auth is ready
  const unsub = useAuthStore.subscribe((state) => {
    if (!state.isLoading && state.token) {
      pullFromServer();
      unsub();
    } else if (!state.isLoading && !state.token) {
      unsub();
    }
  });
});
