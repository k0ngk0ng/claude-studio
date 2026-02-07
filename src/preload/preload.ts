import { contextBridge, ipcRenderer } from 'electron';

export interface ClaudeAPI {
  spawn: (cwd: string, sessionId?: string) => Promise<string>;
  send: (processId: string, content: string) => Promise<boolean>;
  kill: (processId: string) => Promise<boolean>;
  onMessage: (
    callback: (processId: string, message: unknown) => void
  ) => void;
  removeMessageListener: (
    callback: (processId: string, message: unknown) => void
  ) => void;
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

export interface AppAPI {
  getProjectPath: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  getPlatform: () => Promise<'mac' | 'windows' | 'linux'>;
  getHomePath: () => Promise<string>;
  getModel: () => Promise<string>;
  openInEditor: (cwd: string, editor: string) => Promise<boolean>;
  getAvailableEditors: () => Promise<{ id: string; name: string }[]>;
  checkDependencies: () => Promise<{ name: string; found: boolean; path?: string; version?: string; installHint: string }[]>;
}

const claudeMessageListeners = new Map<Function, (...args: any[]) => void>();
const terminalDataListeners = new Map<Function, (...args: any[]) => void>();
const sessionsChangedListeners = new Map<Function, (...args: any[]) => void>();

contextBridge.exposeInMainWorld('api', {
  claude: {
    spawn: (cwd: string, sessionId?: string) =>
      ipcRenderer.invoke('claude:spawn', cwd, sessionId),
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
    getModel: () => ipcRenderer.invoke('app:getModel'),
    openInEditor: (cwd: string, editor: string) => ipcRenderer.invoke('app:openInEditor', cwd, editor),
    getAvailableEditors: () => ipcRenderer.invoke('app:getAvailableEditors'),
    checkDependencies: () => ipcRenderer.invoke('app:checkDependencies'),
  } satisfies AppAPI,
});
