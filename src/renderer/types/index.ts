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
}

export interface GitAPI {
  status: (cwd: string) => Promise<GitStatus>;
  diff: (cwd: string, file?: string, staged?: boolean) => Promise<string>;
  stage: (cwd: string, file: string) => Promise<void>;
  unstage: (cwd: string, file: string) => Promise<void>;
  commit: (cwd: string, message: string) => Promise<string>;
  branch: (cwd: string) => Promise<string>;
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
}

export interface WindowAPI {
  claude: ClaudeAPI;
  sessions: SessionsAPI;
  git: GitAPI;
  terminal: TerminalAPI;
  app: AppAPI;
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
