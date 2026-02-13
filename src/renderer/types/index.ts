// ─── API types exposed via preload ──────────────────────────────────

export interface ClaudeAPI {
  spawn: (cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string) => Promise<string>;
  send: (processId: string, content: string) => Promise<boolean>;
  kill: (processId: string) => Promise<boolean>;
  onMessage: (callback: (processId: string, message: ClaudeStreamEvent) => void) => void;
  removeMessageListener: (callback: (processId: string, message: ClaudeStreamEvent) => void) => void;
  onPermissionRequest: (callback: (processId: string, request: PermissionRequestEvent) => void) => void;
  removePermissionRequestListener: (callback: (processId: string, request: PermissionRequestEvent) => void) => void;
  respondToPermission: (processId: string, requestId: string, response: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }) => Promise<boolean>;
  setPermissionMode: (processId: string, mode: string) => Promise<boolean>;
}

export interface PermissionRequestEvent {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface SessionsAPI {
  list: () => Promise<SessionInfo[]>;
  getMessages: (projectPath: string, sessionId: string) => Promise<RawMessage[]>;
  listProjects: () => Promise<ProjectInfo[]>;
  fork: (projectPath: string, sessionId: string, cutoffUuid: string) => Promise<string | null>;
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
  onExit: (callback: (id: string) => void) => void;
  removeExitListener: (callback: (id: string) => void) => void;
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
  getGitVersion: () => Promise<string>;
  installClaudeCode: () => Promise<{ success: boolean; error?: string; message?: string }>;
  installGit: () => Promise<{ success: boolean; error?: string; message?: string }>;
  openInEditor: (cwd: string, editor: string) => Promise<boolean>;
  getAvailableEditors: () => Promise<{ id: string; name: string }[]>;
  checkDependencies: () => Promise<DependencyStatus[]>;
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
    assets: { name: string; size: number; downloadUrl: string; cdnUrl?: string | null }[];
  }>;
  downloadUpdate: (downloadUrl: string, fileName: string) => Promise<string>;
  installUpdate: (filePath: string) => Promise<boolean>;
  onDownloadProgress: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => void;
  removeDownloadProgressListener: (callback: (data: { downloaded: number; totalSize: number; progress: number }) => void) => void;
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
  name: string;           // directory name, e.g. "agent-browser"
  description: string;    // from SKILL.md frontmatter
  content: string;        // SKILL.md content
  dirPath: string;        // absolute path to skill directory
  filePath: string;       // absolute path to SKILL.md
  hasTemplate: boolean;   // has CLAUDE.md.template
  hasReferences: boolean; // has references/ directory
}

export interface CommandInfo {
  name: string;           // filename without extension, e.g. "gen-image"
  fileName: string;       // full filename, e.g. "gen-image.md"
  type: 'md' | 'sh';     // file type
  description: string;    // from frontmatter or first line
  argumentHint: string;   // from frontmatter
  content: string;        // full file content
  filePath: string;       // absolute path
}

export interface SkillsAPI {
  list: () => Promise<SkillInfo[]>;
  read: (filePath: string) => Promise<string>;
  create: (name: string, content: string) => Promise<boolean>;
  update: (filePath: string, content: string) => Promise<boolean>;
  remove: (dirPath: string) => Promise<boolean>;
}

export interface CommandsAPI {
  list: () => Promise<CommandInfo[]>;
  read: (filePath: string) => Promise<string>;
  create: (fileName: string, content: string) => Promise<boolean>;
  update: (filePath: string, content: string) => Promise<boolean>;
  remove: (filePath: string) => Promise<boolean>;
}

export interface FileReadResult {
  content?: string;
  error?: string;
  size?: number;
}

export interface FileAPI {
  read: (filePath: string, maxSize?: number) => Promise<FileReadResult>;
}

export interface WindowAPI {
  claude: ClaudeAPI;
  sessions: SessionsAPI;
  git: GitAPI;
  terminal: TerminalAPI;
  app: AppAPI;
  file: FileAPI;
  claudeConfig: ClaudeConfigAPI;
  settings: SettingsFileAPI;
  skills: SkillsAPI;
  commands: CommandsAPI;
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
  | 'claude-code'
  | 'permissions'
  | 'skills'
  | 'commands'
  | 'mcp-servers'
  | 'git'
  | 'appearance'
  | 'keybindings'
  | 'about';

export type ThemeMode = 'dark' | 'light' | 'system';
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'dontAsk';
export type AutoApproveLevel = PermissionMode; // backward compat alias
export type SendKeyMode = 'enter' | 'cmd-enter';

export interface GeneralSettings {
  sendKey: SendKeyMode;
  autoApprove: PermissionMode;
  language: string;
  showCostInfo: boolean;
  notifyOnComplete: boolean;
  preventSleep: boolean;
  debugMode: boolean;
}

export interface ModelSettings {
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export interface ProviderEnvVar {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ProviderSettings {
  // Keep the old model fields for backward compat
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  // New: environment variable overrides
  envVars: ProviderEnvVar[];
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

export type StreamingCursorStyle = 'pulse-dot' | 'terminal' | 'scan-line' | 'classic' | 'typewriter' | 'dna-helix' | 'heartbeat' | 'neon-flicker';

export interface AppearanceSettings {
  theme: ThemeMode;
  fontSize: number;
  fontFamily: string;
  editorFontSize: number;
  editorFontFamily: string;
  showLineNumbers: boolean;
  chatLayout: 'centered-sm' | 'centered' | 'centered-lg' | 'centered-xl' | 'full-width';
  streamingCursor: StreamingCursorStyle;
}

export interface KeyBinding {
  id: string;
  label: string;
  keys: string;
  action: string;
}

export interface AppSettings {
  general: GeneralSettings;
  provider: ProviderSettings;
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
  title: string;
  messages: Message[];
  isStreaming: boolean;
}

export interface PanelState {
  sidebar: boolean;
  terminal: boolean;
  diff: boolean;
  logs: boolean;
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
