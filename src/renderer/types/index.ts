// ─── API types exposed via preload ──────────────────────────────────

export interface ClaudeAPI {
  spawn: (cwd: string, sessionId?: string) => Promise<string>;
  send: (processId: string, content: string) => Promise<boolean>;
  kill: (processId: string) => Promise<boolean>;
  onMessage: (callback: (processId: string, message: ClaudeStreamEvent) => void) => void;
  removeMessageListener: (callback: (processId: string, message: ClaudeStreamEvent) => void) => void;
}

export interface SessionsAPI {
  list: () => Promise<SessionInfo[]>;
  getMessages: (projectPath: string, sessionId: string) => Promise<RawMessage[]>;
  listProjects: () => Promise<ProjectInfo[]>;
  onSessionsChanged: (callback: () => void) => void;
  removeSessionsChangedListener: (callback: () => void) => void;
}

export interface GitAPI {
  status: (cwd: string) => Promise<GitStatus>;
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
  checkDependencies: () => Promise<DependencyStatus[]>;
}

export interface WindowAPI {
  claude: ClaudeAPI;
  sessions: SessionsAPI;
  git: GitAPI;
  terminal: TerminalAPI;
  app: AppAPI;
}

export interface DependencyStatus {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  installHint: string;
}

declare global {
  interface Window {
    api: WindowAPI;
  }
}

// ─── Message types ──────────────────────────────────────────────────

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  tool_use_id?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentBlocks?: ContentBlock[];
  timestamp: string;
  toolUse?: ToolUseInfo[];
  isStreaming?: boolean;
  model?: string;
  costUsd?: number;
  durationMs?: number;
}

export interface ToolUseInfo {
  name: string;
  input: Record<string, unknown>;
  result?: string;
}

export interface RawMessage {
  type: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  uuid?: string;
  session_id?: string;
}

// ─── Session types ──────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
  encodedPath: string;
}

// ─── Git types ──────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  status: string;
  statusLabel: string;
  additions: number;
  deletions: number;
}

export interface GitStatus {
  branch: string;
  unstaged: FileChange[];
  staged: FileChange[];
}

// ─── Claude stream event types ──────────────────────────────────────

export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    stop_reason?: string;
  };
  result?: {
    content: string | ContentBlock[];
    cost?: number;
    duration_ms?: number;
    session_id?: string;
  };
  code?: number;
  signal?: string;
}

// ─── Settings types ─────────────────────────────────────────────────

export type SettingsTab =
  | 'general'
  | 'model'
  | 'permissions'
  | 'mcp-servers'
  | 'git'
  | 'appearance'
  | 'keybindings';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AutoApproveLevel = 'suggest' | 'auto-edit' | 'full-auto';
export type SendKeyMode = 'enter' | 'cmd-enter';

export interface GeneralSettings {
  sendKey: SendKeyMode;
  autoApprove: AutoApproveLevel;
  showCostInfo: boolean;
  notifyOnComplete: boolean;
  preventSleep: boolean;
}

export interface ModelSettings {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export interface PermissionSettings {
  allowFileWrite: boolean;
  allowFileRead: boolean;
  allowBash: boolean;
  allowMcp: boolean;
  disallowedCommands: string[];
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface GitSettings {
  autoStage: boolean;
  showDiffOnCommit: boolean;
  defaultCommitPrefix: string;
  autoPush: boolean;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  fontSize: number;
  fontFamily: string;
  editorFontSize: number;
  editorFontFamily: string;
  showLineNumbers: boolean;
  opaqueBackground: boolean;
}

export interface KeyBinding {
  id: string;
  label: string;
  keys: string;
  action: string;
}

export interface AppSettings {
  general: GeneralSettings;
  model: ModelSettings;
  permissions: PermissionSettings;
  mcpServers: McpServer[];
  git: GitSettings;
  appearance: AppearanceSettings;
  keybindings: KeyBinding[];
}

// ─── App state ──────────────────────────────────────────────────────

export interface CurrentSession {
  id: string | null;
  processId: string | null;
  projectPath: string;
  messages: Message[];
  isStreaming: boolean;
}

export interface PanelState {
  sidebar: boolean;
  terminal: boolean;
  diff: boolean;
}

export interface PanelSizes {
  sidebar: number;   // width in px
  terminal: number;  // height in px
  diff: number;      // width in px
}

export interface AppState {
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
}
