import { contextBridge, ipcRenderer } from 'electron';

export interface ClaudeAPI {
  spawn: (cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string) => Promise<string>;
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

export interface SessionsAPI {
  list: () => Promise<unknown[]>;
  getMessages: (projectPath: string, sessionId: string) => Promise<unknown[]>;
  listProjects: () => Promise<unknown[]>;
  onSessionsChanged: (callback: () => void) => void;
  removeSessionsChangedListener: (callback: () => void) => void;
}

export interface GitAPI {
  status: (cwd: string) => Promise<unknown>;
  diff: (cwd: string, file?: string, staged?: boolean) => Promise<string>;
  stage: (cwd: string, file: string) => Promise<void>;
  unstage: (cwd: string, file: string) => Promise<void>;
  commit: (cwd: string, message: string) => Promise<string>;
  branch: (cwd: string) => Promise<string>;
  listBranches: (cwd: string) => Promise<{ name: string; current: boolean }[]>;
  checkout: (cwd: string, branch: string) => Promise<string>;
  createBranch: (cwd: string, branch: string) => Promise<string>;
  searchFiles: (cwd: string, query: string) => Promise<{ name: string; path: string }[]>;
  listFiles: (cwd: string) => Promise<string[]>;
  push: (cwd: string) => Promise<string>;
  pushTags: (cwd: string) => Promise<string>;
}

export interface TerminalAPI {
  create: (cwd: string) => Promise<string | null>;
  write: (id: string, data: string) => Promise<boolean>;
  resize: (id: string, cols: number, rows: number) => Promise<boolean>;
  kill: (id: string) => Promise<boolean>;
  onData: (callback: (id: string, data: string) => void) => void;
  removeDataListener: (callback: (id: string, data: string) => void) => void;
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
  fileName: string;
  type: 'md' | 'sh';
  scope: 'global' | 'project';
  description: string;
  argumentHint: string;
  content: string;
  filePath: string;
}

export interface SkillsAPI {
  list: (projectPath?: string) => Promise<SkillInfo[]>;
  read: (filePath: string) => Promise<string>;
  create: (scope: 'global' | 'project', fileName: string, content: string, projectPath?: string) => Promise<boolean>;
  update: (filePath: string, content: string) => Promise<boolean>;
  remove: (filePath: string) => Promise<boolean>;
}

export interface AppAPI {
  getProjectPath: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  getPlatform: () => Promise<'mac' | 'windows' | 'linux'>;
  getHomePath: () => Promise<string>;
  getVersion: () => Promise<string>;
  getModel: () => Promise<string>;
  getAgentSdkVersion: () => Promise<string>;
  getClaudeCodeVersion: () => Promise<string>;
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
  checkForUpdates: () => Promise<{
    version: string;
    tagName: string;
    name: string;
    body: string;
    htmlUrl: string;
    assets: { name: string; size: number; downloadUrl: string }[];
  }>;
  downloadUpdate: (downloadUrl: string, fileName: string) => Promise<string>;
  installUpdate: (filePath: string) => Promise<boolean>;
  onDownloadProgress: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => void;
  removeDownloadProgressListener: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => void;
}

const claudeMessageListeners = new Map<Function, (...args: any[]) => void>();
const claudePermissionListeners = new Map<Function, (...args: any[]) => void>();
const terminalDataListeners = new Map<Function, (...args: any[]) => void>();
const installProgressListeners = new Map<Function, (...args: any[]) => void>();
const downloadProgressListeners = new Map<Function, (...args: any[]) => void>();
const sessionsChangedListeners = new Map<Function, (...args: any[]) => void>();

contextBridge.exposeInMainWorld('api', {
  claude: {
    spawn: (cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string) =>
      ipcRenderer.invoke('claude:spawn', cwd, sessionId, permissionMode, envVars, language),
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

  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    getMessages: (projectPath: string, sessionId: string) =>
      ipcRenderer.invoke('sessions:getMessages', projectPath, sessionId),
    listProjects: () => ipcRenderer.invoke('sessions:listProjects'),
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
  } satisfies TerminalAPI,

  app: {
    getProjectPath: () => ipcRenderer.invoke('app:getProjectPath'),
    selectDirectory: () => ipcRenderer.invoke('app:selectDirectory'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getHomePath: () => ipcRenderer.invoke('app:getHomePath'),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getModel: () => ipcRenderer.invoke('app:getModel'),
    getAgentSdkVersion: () => ipcRenderer.invoke('app:getAgentSdkVersion'),
    getClaudeCodeVersion: () => ipcRenderer.invoke('app:getClaudeCodeVersion'),
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
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: (downloadUrl: string, fileName: string) => ipcRenderer.invoke('app:downloadUpdate', downloadUrl, fileName),
    installUpdate: (filePath: string) => ipcRenderer.invoke('app:installUpdate', filePath),
    onDownloadProgress: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { downloaded: number; totalSize: number; progress: number }) => {
        callback(data);
      };
      downloadProgressListeners.set(callback, wrappedCallback);
      ipcRenderer.on('app:download-progress', wrappedCallback);
    },
    removeDownloadProgressListener: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => {
      const wrappedCallback = downloadProgressListeners.get(callback);
      if (wrappedCallback) {
        ipcRenderer.removeListener('app:download-progress', wrappedCallback);
        downloadProgressListeners.delete(callback);
      }
    },
  } satisfies AppAPI,

  claudeConfig: {
    read: () => ipcRenderer.invoke('claudeConfig:read'),
    write: (updates: Record<string, unknown>) => ipcRenderer.invoke('claudeConfig:write', updates),
  } satisfies ClaudeConfigAPI,

  settings: {
    read: () => ipcRenderer.invoke('settings:read'),
    write: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:write', data),
  } satisfies SettingsFileAPI,

  skills: {
    list: (projectPath?: string) => ipcRenderer.invoke('skills:list', projectPath),
    read: (filePath: string) => ipcRenderer.invoke('skills:read', filePath),
    create: (scope: 'global' | 'project', fileName: string, content: string, projectPath?: string) =>
      ipcRenderer.invoke('skills:create', scope, fileName, content, projectPath),
    update: (filePath: string, content: string) => ipcRenderer.invoke('skills:update', filePath, content),
    remove: (filePath: string) => ipcRenderer.invoke('skills:remove', filePath),
  } satisfies SkillsAPI,
});
