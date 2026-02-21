import { contextBridge, ipcRenderer } from 'electron';

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface ClaudeAPI {
  spawn: (cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string, mcpServers?: McpServer[]) => Promise<string>;
  send: (processId: string, content: string) => Promise<boolean>;
  kill: (processId: string) => Promise<boolean>;
  onMessage: (
    callback: (processId: string, message: unknown) => void
  ) => void;
  removeMessageListener: (
    callback: (processId: string, message: unknown) => void
  ) => void;
  onPermissionRequest: (
    callback: (processId: string, request: unknown) => void
  ) => void;
  removePermissionRequestListener: (
    callback: (processId: string, request: unknown) => void
  ) => void;
  respondToPermission: (
    processId: string,
    requestId: string,
    response: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }
  ) => Promise<boolean>;
  setPermissionMode: (processId: string, mode: string) => Promise<boolean>;
}

export interface McpAPI {
  getRunningServers: () => Promise<Array<{ id: string; name: string; uptime: number }>>;
}

export interface SessionsAPI {
  list: () => Promise<unknown[]>;
  getMessages: (projectPath: string, sessionId: string) => Promise<unknown[]>;
  listProjects: () => Promise<unknown[]>;
  fork: (projectPath: string, sessionId: string, cutoffUuid: string) => Promise<string | null>;
  archive: (projectPath: string, sessionId: string) => Promise<boolean>;
  unarchive: (archivedSessionId: string) => Promise<boolean>;
  listArchived: () => Promise<unknown[]>;
  onSessionsChanged: (callback: () => void) => void;
  removeSessionsChangedListener: (callback: () => void) => void;
}

export interface GitAPI {
  status: (cwd: string) => Promise<unknown>;
  diff: (cwd: string, file?: string, staged?: boolean) => Promise<string>;
  stage: (cwd: string, file: string) => Promise<void>;
  unstage: (cwd: string, file: string) => Promise<void>;
  discard: (cwd: string, file: string) => Promise<void>;
  discardAll: (cwd: string) => Promise<void>;
  commit: (cwd: string, message: string) => Promise<string>;
  branch: (cwd: string) => Promise<string>;
  listBranches: (cwd: string) => Promise<{ name: string; current: boolean }[]>;
  checkout: (cwd: string, branch: string) => Promise<string>;
  createBranch: (cwd: string, branch: string) => Promise<string>;
  searchFiles: (cwd: string, query: string) => Promise<{ name: string; path: string }[]>;
  listFiles: (cwd: string) => Promise<string[]>;
  push: (cwd: string) => Promise<string>;
  pushTags: (cwd: string) => Promise<string>;
  log: (cwd: string, maxCount?: number) => Promise<{ hash: string; shortHash: string; subject: string; author: string; date: string }[]>;
  showCommitFiles: (cwd: string, hash: string) => Promise<{ path: string; status: string }[]>;
  showCommitFileDiff: (cwd: string, hash: string, file: string) => Promise<string>;
}

export interface TerminalAPI {
  create: (cwd: string) => Promise<string | null>;
  write: (id: string, data: string) => Promise<boolean>;
  resize: (id: string, cols: number, rows: number) => Promise<boolean>;
  kill: (id: string) => Promise<boolean>;
  onData: (callback: (id: string, data: string) => void) => void;
  removeDataListener: (callback: (id: string, data: string) => void) => void;
  onExit: (callback: (id: string) => void) => void;
  removeExitListener: (callback: (id: string) => void) => void;
}

export interface ClaudeConfigAPI {
  read: () => Promise<Record<string, unknown>>;
  write: (updates: Record<string, unknown>) => Promise<boolean>;
}

export interface SettingsFileAPI {
  read: () => Promise<Record<string, unknown> | null>;
  write: (data: Record<string, unknown>) => Promise<boolean>;
}

export interface SkillInfo {
  name: string;
  description: string;
  content: string;
  dirPath: string;
  filePath: string;
  hasTemplate: boolean;
  hasReferences: boolean;
}

export interface SkillsAPI {
  list: () => Promise<SkillInfo[]>;
  read: (filePath: string) => Promise<string>;
  create: (name: string, content: string) => Promise<boolean>;
  update: (filePath: string, content: string) => Promise<boolean>;
  remove: (dirPath: string) => Promise<boolean>;
}

export interface CommandInfo {
  name: string;
  fileName: string;
  type: 'md' | 'sh';
  description: string;
  argumentHint: string;
  content: string;
  filePath: string;
}

export interface CommandsAPI {
  list: () => Promise<CommandInfo[]>;
  read: (filePath: string) => Promise<string>;
  create: (fileName: string, content: string) => Promise<boolean>;
  update: (filePath: string, content: string) => Promise<boolean>;
  remove: (filePath: string) => Promise<boolean>;
}

export interface AuthAPI {
  register: (email: string, username: string, password: string) => Promise<{ success: boolean; user?: unknown; token?: string; error?: string }>;
  login: (emailOrUsername: string, password: string) => Promise<{ success: boolean; user?: unknown; token?: string; error?: string }>;
  logout: (token: string) => Promise<boolean>;
  validate: (token: string) => Promise<{ success: boolean; user?: unknown; token?: string; error?: string }>;
  updateProfile: (token: string, updates: { username?: string; avatarUrl?: string }) => Promise<{ success: boolean; user?: unknown; error?: string }>;
  changePassword: (token: string, oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getSettings: (token: string) => Promise<Record<string, unknown>>;
  setSettings: (token: string, key: string, value: unknown) => Promise<boolean>;
  getServerUrl: () => Promise<string>;
  getDefaultServerUrl: () => Promise<string>;
  saveToken: (token: string) => Promise<boolean>;
  loadToken: () => Promise<string | null>;
  clearToken: () => Promise<boolean>;
}

export interface RemoteAPI {
  connect: (token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  generatePairingQR: () => Promise<string | null>;
  revokePairing: (deviceId: string) => Promise<boolean>;
  getPairedDevices: () => Promise<unknown[]>;
  unlock: (password: string) => Promise<boolean>;
  getState: () => Promise<unknown>;
  updateSettings: (settings: { lockPassword?: string; allowRemoteControl?: boolean; autoLockTimeout?: number }) => Promise<boolean>;
  onStateChanged: (callback: (state: unknown) => void) => void;
  removeStateChangedListener: (callback: (state: unknown) => void) => void;
  onControlRequest: (callback: (deviceId: string, deviceName: string) => void) => void;
  removeControlRequestListener: (callback: (deviceId: string, deviceName: string) => void) => void;
}

export interface AppAPI {
  getProjectPath: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  getPlatform: () => Promise<'mac' | 'windows' | 'linux'>;
  getSystemLocale: () => Promise<string>;
  getHomePath: () => Promise<string>;
  getVersion: () => Promise<string>;
  getModel: () => Promise<string>;
  getAgentSdkVersion: () => Promise<string>;
  getClaudeCodeVersion: () => Promise<string>;
  getGitVersion: () => Promise<string>;
  installClaudeCode: () => Promise<{ success: boolean; error?: string; message?: string }>;
  installGit: () => Promise<{ success: boolean; error?: string; message?: string }>;
  openInEditor: (cwd: string, editor: string) => Promise<boolean>;
  getAvailableEditors: () => Promise<{ id: string; name: string }[]>;
  checkDependencies: () => Promise<{ name: string; found: boolean; path?: string; version?: string; installHint: string }[]>;
  checkRuntimeDeps: () => Promise<{ name: string; found: boolean; error?: string }[]>;
  installRuntimeDeps: () => Promise<{ success: boolean; installed: string[]; error?: string }>;
  onInstallProgress: (callback: (data: string) => void) => void;
  removeInstallProgressListener: (callback: (data: string) => void) => void;
  toggleDevTools: () => Promise<void>;
  showItemInFolder: (fullPath: string) => Promise<boolean>;
  openFile: (fullPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  preventSleep: (prevent: boolean) => Promise<number | null>;
  checkForUpdates: () => Promise<{
    version: string;
    tagName: string;
    name: string;
    body: string;
    htmlUrl: string;
    assets: { name: string; size: number; downloadUrl: string; cdnUrl?: string | null }[];
  }>;
  downloadUpdate: (platform: string) => Promise<void>;
  installUpdate: () => Promise<boolean>;
  onUpdateStatus: (callback: (data: {
    state: string;
    release?: any;
    progress?: number;
    downloaded?: number;
    totalSize?: number;
    message?: string;
  }) => void) => void;
  removeUpdateStatusListener: (callback: (data: any) => void) => void;
}

const claudeMessageListeners = new Map<Function, (...args: any[]) => void>();
const claudePermissionListeners = new Map<Function, (...args: any[]) => void>();
const terminalDataListeners = new Map<Function, (...args: any[]) => void>();
const terminalExitListeners = new Map<Function, (...args: any[]) => void>();
const installProgressListeners = new Map<Function, (...args: any[]) => void>();
const downloadProgressListeners = new Map<Function, (...args: any[]) => void>();
const updateStatusListeners = new Map<Function, (...args: any[]) => void>();
const sessionsChangedListeners = new Map<Function, (...args: any[]) => void>();
const remoteStateListeners = new Map<Function, (...args: any[]) => void>();
const remoteControlRequestListeners = new Map<Function, (...args: any[]) => void>();

contextBridge.exposeInMainWorld('api', {
  claude: {
    spawn: (cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string, mcpServers?: McpServer[]) =>
      ipcRenderer.invoke('claude:spawn', cwd, sessionId, permissionMode, envVars, language, mcpServers),
    send: (processId: string, content: string) =>
      ipcRenderer.invoke('claude:send', processId, content),
    kill: (processId: string) => ipcRenderer.invoke('claude:kill', processId),
    onMessage: (callback: (processId: string, message: unknown) => void) => {
      const wrappedCallback = (
        _event: Electron.IpcRendererEvent,
        processId: string,
        message: unknown
      ) => {
        callback(processId, message);
      };
      claudeMessageListeners.set(callback, wrappedCallback);
      ipcRenderer.on('claude:message', wrappedCallback);
    },
    removeMessageListener: (
      callback: (processId: string, message: unknown) => void
    ) => {
      const wrappedCallback = claudeMessageListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('claude:message', wrappedCallback);
        claudeMessageListeners.delete(callback);
      }
    },
    onPermissionRequest: (callback: (processId: string, request: unknown) => void) => {
      const wrappedCallback = (
        _event: Electron.IpcRendererEvent,
        processId: string,
        request: unknown
      ) => {
        callback(processId, request);
      };
      claudePermissionListeners.set(callback, wrappedCallback);
      ipcRenderer.on('claude:permission-request', wrappedCallback);
    },
    removePermissionRequestListener: (callback: (processId: string, request: unknown) => void) => {
      const wrappedCallback = claudePermissionListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('claude:permission-request', wrappedCallback);
        claudePermissionListeners.delete(callback);
      }
    },
    respondToPermission: (
      processId: string,
      requestId: string,
      response: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }
    ) => ipcRenderer.invoke('claude:permission-response', processId, requestId, response),
    setPermissionMode: (processId: string, mode: string) =>
      ipcRenderer.invoke('claude:setPermissionMode', processId, mode),
  } satisfies ClaudeAPI,

  mcp: {
    getRunningServers: () => ipcRenderer.invoke('mcp:getRunningServers'),
  } satisfies McpAPI,

  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    getMessages: (projectPath: string, sessionId: string) =>
      ipcRenderer.invoke('sessions:getMessages', projectPath, sessionId),
    listProjects: () => ipcRenderer.invoke('sessions:listProjects'),
    fork: (projectPath: string, sessionId: string, cutoffUuid: string) =>
      ipcRenderer.invoke('sessions:fork', projectPath, sessionId, cutoffUuid),
    archive: (projectPath: string, sessionId: string) =>
      ipcRenderer.invoke('sessions:archive', projectPath, sessionId),
    unarchive: (archivedSessionId: string) =>
      ipcRenderer.invoke('sessions:unarchive', archivedSessionId),
    listArchived: () => ipcRenderer.invoke('sessions:listArchived'),
    onSessionsChanged: (callback: () => void) => {
      const wrappedCallback = () => { callback(); };
      sessionsChangedListeners.set(callback, wrappedCallback);
      ipcRenderer.on('sessions:changed', wrappedCallback);
    },
    removeSessionsChangedListener: (callback: () => void) => {
      const wrappedCallback = sessionsChangedListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('sessions:changed', wrappedCallback);
        sessionsChangedListeners.delete(callback);
      }
    },
  } satisfies SessionsAPI,

  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    diff: (cwd: string, file?: string, staged?: boolean) =>
      ipcRenderer.invoke('git:diff', cwd, file, staged),
    stage: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:stage', cwd, file),
    unstage: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:unstage', cwd, file),
    discard: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:discard', cwd, file),
    discardAll: (cwd: string) =>
      ipcRenderer.invoke('git:discardAll', cwd),
    commit: (cwd: string, message: string) =>
      ipcRenderer.invoke('git:commit', cwd, message),
    branch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
    listBranches: (cwd: string) => ipcRenderer.invoke('git:listBranches', cwd),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git:checkout', cwd, branch),
    createBranch: (cwd: string, branch: string) => ipcRenderer.invoke('git:createBranch', cwd, branch),
    searchFiles: (cwd: string, query: string) => ipcRenderer.invoke('git:searchFiles', cwd, query),
    listFiles: (cwd: string) => ipcRenderer.invoke('git:listFiles', cwd),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    pushTags: (cwd: string) => ipcRenderer.invoke('git:pushTags', cwd),
    log: (cwd: string, maxCount?: number) => ipcRenderer.invoke('git:log', cwd, maxCount),
    showCommitFiles: (cwd: string, hash: string) => ipcRenderer.invoke('git:showCommitFiles', cwd, hash),
    showCommitFileDiff: (cwd: string, hash: string, file: string) => ipcRenderer.invoke('git:showCommitFileDiff', cwd, hash, file),
  } satisfies GitAPI,

  terminal: {
    create: (cwd: string) => ipcRenderer.invoke('terminal:create', cwd),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    onData: (callback: (id: string, data: string) => void) => {
      const wrappedCallback = (
        _event: Electron.IpcRendererEvent,
        id: string,
        data: string
      ) => {
        callback(id, data);
      };
      terminalDataListeners.set(callback, wrappedCallback);
      ipcRenderer.on('terminal:data', wrappedCallback);
    },
    removeDataListener: (callback: (id: string, data: string) => void) => {
      const wrappedCallback = terminalDataListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('terminal:data', wrappedCallback);
        terminalDataListeners.delete(callback);
      }
    },
    onExit: (callback: (id: string) => void) => {
      const wrappedCallback = (
        _event: Electron.IpcRendererEvent,
        id: string
      ) => {
        callback(id);
      };
      terminalExitListeners.set(callback, wrappedCallback);
      ipcRenderer.on('terminal:exit', wrappedCallback);
    },
    removeExitListener: (callback: (id: string) => void) => {
      const wrappedCallback = terminalExitListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('terminal:exit', wrappedCallback);
        terminalExitListeners.delete(callback);
      }
    },
  } satisfies TerminalAPI,

  app: {
    getProjectPath: () => ipcRenderer.invoke('app:getProjectPath'),
    selectDirectory: () => ipcRenderer.invoke('app:selectDirectory'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getSystemLocale: () => ipcRenderer.invoke('app:getSystemLocale'),
    getHomePath: () => ipcRenderer.invoke('app:getHomePath'),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getModel: () => ipcRenderer.invoke('app:getModel'),
    getAgentSdkVersion: () => ipcRenderer.invoke('app:getAgentSdkVersion'),
    getClaudeCodeVersion: () => ipcRenderer.invoke('app:getClaudeCodeVersion'),
    getGitVersion: () => ipcRenderer.invoke('app:getGitVersion'),
    installClaudeCode: () => ipcRenderer.invoke('app:installClaudeCode'),
    installGit: () => ipcRenderer.invoke('app:installGit'),
    openInEditor: (cwd: string, editor: string) => ipcRenderer.invoke('app:openInEditor', cwd, editor),
    getAvailableEditors: () => ipcRenderer.invoke('app:getAvailableEditors'),
    checkDependencies: () => ipcRenderer.invoke('app:checkDependencies'),
    checkRuntimeDeps: () => ipcRenderer.invoke('app:checkRuntimeDeps'),
    installRuntimeDeps: () => ipcRenderer.invoke('app:installRuntimeDeps'),
    onInstallProgress: (callback: (data: string) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: string) => {
        callback(data);
      };
      installProgressListeners.set(callback, wrappedCallback);
      ipcRenderer.on('app:install-progress', wrappedCallback);
    },
    removeInstallProgressListener: (callback: (data: string) => void) => {
      const wrappedCallback = installProgressListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('app:install-progress', wrappedCallback);
        installProgressListeners.delete(callback);
      }
    },
    toggleDevTools: () => ipcRenderer.invoke('app:toggleDevTools'),
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('app:showItemInFolder', fullPath),
    openFile: (fullPath: string) => ipcRenderer.invoke('app:openFile', fullPath),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    preventSleep: (prevent: boolean) => ipcRenderer.invoke('app:preventSleep', prevent),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: (platform: string) => ipcRenderer.invoke('app:downloadUpdate', platform),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdateStatus: (callback: (data: {
      state: string;
      release?: any;
      progress?: number;
      downloaded?: number;
      totalSize?: number;
      message?: string;
    }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: any) => {
        callback(data);
      };
      updateStatusListeners.set(callback, wrappedCallback);
      ipcRenderer.on('app:update-status', wrappedCallback);
    },
    removeUpdateStatusListener: (callback: (data: any) => void) => {
      const wrappedCallback = updateStatusListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('app:update-status', wrappedCallback);
        updateStatusListeners.delete(callback);
      }
    },
  } satisfies AppAPI,

  file: {
    read: (filePath: string, maxSize?: number) =>
      ipcRenderer.invoke('file:read', filePath, maxSize),
  },

  claudeConfig: {
    read: () => ipcRenderer.invoke('claudeConfig:read'),
    write: (updates: Record<string, unknown>) => ipcRenderer.invoke('claudeConfig:write', updates),
  } satisfies ClaudeConfigAPI,

  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:write', data),
  } satisfies SettingsFileAPI,

  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    read: (filePath: string) => ipcRenderer.invoke('skills:read', filePath),
    create: (name: string, content: string) => ipcRenderer.invoke('skills:create', name, content),
    update: (filePath: string, content: string) => ipcRenderer.invoke('skills:update', filePath, content),
    remove: (dirPath: string) => ipcRenderer.invoke('skills:remove', dirPath),
  } satisfies SkillsAPI,

  commands: {
    list: () => ipcRenderer.invoke('commands:list'),
    read: (filePath: string) => ipcRenderer.invoke('commands:read', filePath),
    create: (fileName: string, content: string) => ipcRenderer.invoke('commands:create', fileName, content),
    update: (filePath: string, content: string) => ipcRenderer.invoke('commands:update', filePath, content),
    remove: (filePath: string) => ipcRenderer.invoke('commands:remove', filePath),
  } satisfies CommandsAPI,

  auth: {
    register: (email: string, username: string, password: string) =>
      ipcRenderer.invoke('auth:register', email, username, password),
    login: (emailOrUsername: string, password: string) =>
      ipcRenderer.invoke('auth:login', emailOrUsername, password),
    logout: (token: string) =>
      ipcRenderer.invoke('auth:logout', token),
    validate: (token: string) =>
      ipcRenderer.invoke('auth:validate', token),
    updateProfile: (token: string, updates: { username?: string; avatarUrl?: string }) =>
      ipcRenderer.invoke('auth:updateProfile', token, updates),
    changePassword: (token: string, oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', token, oldPassword, newPassword),
    getSettings: (token: string) =>
      ipcRenderer.invoke('auth:getSettings', token),
    setSettings: (token: string, key: string, value: unknown) =>
      ipcRenderer.invoke('auth:setSettings', token, key, value),
    getServerUrl: () =>
      ipcRenderer.invoke('auth:getServerUrl'),
    getDefaultServerUrl: () =>
      ipcRenderer.invoke('auth:getDefaultServerUrl'),
    saveToken: (token: string) =>
      ipcRenderer.invoke('auth:saveToken', token),
    loadToken: () =>
      ipcRenderer.invoke('auth:loadToken'),
    clearToken: () =>
      ipcRenderer.invoke('auth:clearToken'),
  } satisfies AuthAPI,

  remote: {
    connect: (token: string) =>
      ipcRenderer.invoke('remote:connect', token),
    disconnect: () =>
      ipcRenderer.invoke('remote:disconnect'),
    generatePairingQR: () =>
      ipcRenderer.invoke('remote:generateQR'),
    revokePairing: (deviceId: string) =>
      ipcRenderer.invoke('remote:revokePairing', deviceId),
    getPairedDevices: () =>
      ipcRenderer.invoke('remote:getPairedDevices'),
    unlock: (password: string) =>
      ipcRenderer.invoke('remote:unlock', password),
    getState: () =>
      ipcRenderer.invoke('remote:getState'),
    updateSettings: (settings: { lockPassword?: string; allowRemoteControl?: boolean; autoLockTimeout?: number }) =>
      ipcRenderer.invoke('remote:updateSettings', settings),
    onStateChanged: (callback: (state: unknown) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, state: unknown) => {
        callback(state);
      };
      remoteStateListeners.set(callback, wrappedCallback);
      ipcRenderer.on('remote:state-changed', wrappedCallback);
    },
    removeStateChangedListener: (callback: (state: unknown) => void) => {
      const wrappedCallback = remoteStateListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('remote:state-changed', wrappedCallback);
        remoteStateListeners.delete(callback);
      }
    },
    onControlRequest: (callback: (deviceId: string, deviceName: string) => void) => {
      const wrappedCallback = (
        _event: Electron.IpcRendererEvent,
        deviceId: string,
        deviceName: string,
      ) => {
        callback(deviceId, deviceName);
      };
      remoteControlRequestListeners.set(callback, wrappedCallback);
      ipcRenderer.on('remote:control-request', wrappedCallback);
    },
    removeControlRequestListener: (callback: (deviceId: string, deviceName: string) => void) => {
      const wrappedCallback = remoteControlRequestListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('remote:control-request', wrappedCallback);
        remoteControlRequestListeners.delete(callback);
      }
    },
  } satisfies RemoteAPI,
});
