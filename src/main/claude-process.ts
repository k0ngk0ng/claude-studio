import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import path from 'path';
import { createRequire } from 'module';
import { app } from 'electron';
import fs from 'fs';

// Dynamic import for ESM module
let queryFn: typeof import('@anthropic-ai/claude-agent-sdk').query | null = null;
let sdkCliPath: string | undefined;

async function getQuery() {
  if (!queryFn) {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
  }
  return queryFn;
}

function getSdkCliPath(): string {
  if (sdkCliPath) return sdkCliPath;

  // Try multiple resolution strategies
  const candidates: string[] = [];

  // 1. Use createRequire to resolve from the SDK package
  try {
    const require = createRequire(import.meta.url || __filename);
    const sdkMain = require.resolve('@anthropic-ai/claude-agent-sdk');
    candidates.push(path.join(path.dirname(sdkMain), 'cli.js'));
  } catch {
    // SDK not resolvable via createRequire
  }

  // 2. Production: unpacked alongside asar (cli.js is unpacked for execution)
  if (app?.isPackaged) {
    const unpackedBase = path.join(app.getAppPath() + '.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
    candidates.push(unpackedBase);

    // 3. Production: inside asar (fallback)
    const asarBase = path.join(app.getAppPath(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
    candidates.push(asarBase);

    // 4. Production: in resources directory
    const resourceBase = path.join(process.resourcesPath || '', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
    candidates.push(resourceBase);
  }

  // 5. Dev fallback: project root node_modules
  candidates.push(path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js'));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        sdkCliPath = candidate;
        return sdkCliPath;
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  // Last resort — return first candidate and let it fail with a clear error
  sdkCliPath = candidates[0] || 'cli.js';
  return sdkCliPath;
}

export interface ClaudeMessage {
  type: string;
  subtype?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    stop_reason?: string;
  };
  session_id?: string;
  tool_use?: {
    name: string;
    input: Record<string, unknown>;
  };
  result?: {
    content: string | ContentBlock[];
    cost?: number;
    duration_ms?: number;
    session_id?: string;
  };
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  tool_use_id?: string;
}

export interface PermissionRequest {
  processId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface ManagedSession {
  cwd: string;
  sessionId?: string;
  abortController: AbortController;
  permissionResolvers: Map<string, (result: PermissionResponse) => void>;
  queryInstance?: any; // SDK Query object — has setPermissionMode(), interrupt(), etc.
}

export interface PermissionResponse {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
}

class ClaudeProcessManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();

  async spawn(
    cwd: string,
    sessionId?: string,
    permissionMode?: string,
  ): Promise<string> {
    const processId = randomUUID();
    const abortController = new AbortController();

    const managed: ManagedSession = {
      cwd,
      sessionId,
      abortController,
      permissionResolvers: new Map(),
    };
    this.sessions.set(processId, managed);

    // Start the SDK query in background
    this._runQuery(processId, managed, permissionMode).catch((err) => {
      this.emit('error', processId, err?.message || String(err));
    });

    return processId;
  }

  private async _runQuery(
    processId: string,
    managed: ManagedSession,
    permissionMode?: string,
  ) {
    const query = await getQuery();

    // Build options
    const options: Record<string, unknown> = {
      cwd: managed.cwd,
      abortController: managed.abortController,
      includePartialMessages: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      pathToClaudeCodeExecutable: getSdkCliPath(),
    };

    // Permission mode
    if (permissionMode && permissionMode !== 'default') {
      options.permissionMode = permissionMode;
    }

    // Resume session
    if (managed.sessionId) {
      options.resume = managed.sessionId;
    }

    // canUseTool callback — bridges permission requests to renderer
    options.canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      _opts: { signal: AbortSignal },
    ) => {
      const requestId = randomUUID();

      // Emit permission request to renderer
      this.emit('permission-request', processId, {
        requestId,
        toolName,
        input,
      } as PermissionRequest);

      // Wait for response from renderer
      return new Promise<{ behavior: string; updatedInput?: unknown; message?: string }>((resolve) => {
        managed.permissionResolvers.set(requestId, (response: PermissionResponse) => {
          managed.permissionResolvers.delete(requestId);
          if (response.behavior === 'allow') {
            resolve({
              behavior: 'allow',
              updatedInput: response.updatedInput || input,
            });
          } else {
            resolve({
              behavior: 'deny',
              message: response.message || 'User denied this action',
            });
          }
        });
      });
    };

    // Create streaming input for multi-turn conversation
    const inputQueue: Array<{
      type: string;
      message: { role: string; content: string };
    }> = [];
    let inputResolve: (() => void) | null = null;
    let inputDone = false;

    // Store the input queue on the managed session for sendMessage
    (managed as any)._inputQueue = inputQueue;
    (managed as any)._inputResolve = () => inputResolve?.();
    (managed as any)._setInputResolve = (fn: () => void) => { inputResolve = fn; };
    (managed as any)._inputDone = () => inputDone;
    (managed as any)._setInputDone = (v: boolean) => { inputDone = v; };

    // Async generator for streaming input
    async function* streamInput() {
      while (!inputDone) {
        if (inputQueue.length > 0) {
          yield inputQueue.shift()!;
        } else {
          // Wait for new input
          await new Promise<void>((resolve) => {
            inputResolve = resolve;
            (managed as any)._inputResolve = () => resolve();
          });
        }
      }
    }

    try {
      const queryIterator = query({
        prompt: streamInput() as any,
        options: options as any,
      });

      // Store the query instance for runtime control (setPermissionMode, etc.)
      managed.queryInstance = queryIterator;

      for await (const message of queryIterator) {
        // Forward SDK messages to renderer (same format as stream-json)
        this.emit('message', processId, message);

        // Track session ID
        if (message.type === 'system' && (message as any).subtype === 'init') {
          managed.sessionId = (message as any).session_id;
        }

        // Check if result
        if (message.type === 'result') {
          break;
        }
      }

      // Clean exit
      this.emit('exit', processId, 0, null);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        this.emit('exit', processId, 0, 'SIGTERM');
      } else {
        this.emit('error', processId, err?.message || String(err));
        this.emit('exit', processId, 1, null);
      }
    } finally {
      this.sessions.delete(processId);
    }
  }

  sendMessage(processId: string, content: string): boolean {
    const managed = this.sessions.get(processId);
    if (!managed) return false;

    const queue = (managed as any)._inputQueue as Array<any>;
    if (!queue) return false;

    queue.push({
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    });

    // Wake up the input generator
    const resolve = (managed as any)._inputResolve;
    if (typeof resolve === 'function') {
      resolve();
    }

    return true;
  }

  respondToPermission(processId: string, requestId: string, response: PermissionResponse): boolean {
    const managed = this.sessions.get(processId);
    if (!managed) return false;

    const resolver = managed.permissionResolvers.get(requestId);
    if (!resolver) return false;

    resolver(response);
    return true;
  }

  async setPermissionMode(processId: string, mode: string): Promise<boolean> {
    const managed = this.sessions.get(processId);
    if (!managed?.queryInstance) return false;

    try {
      await managed.queryInstance.setPermissionMode(mode);
      return true;
    } catch {
      return false;
    }
  }

  kill(processId: string): boolean {
    const managed = this.sessions.get(processId);
    if (!managed) return false;

    // Signal input stream to stop
    (managed as any)._setInputDone?.(true);
    (managed as any)._inputResolve?.();

    // Abort the query
    managed.abortController.abort();

    // Resolve any pending permission requests
    for (const [, resolver] of managed.permissionResolvers) {
      resolver({ behavior: 'deny', message: 'Session terminated' });
    }
    managed.permissionResolvers.clear();

    this.sessions.delete(processId);
    return true;
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }

  isRunning(processId: string): boolean {
    return this.sessions.has(processId);
  }

  getProcessInfo(processId: string): { cwd: string; sessionId?: string } | null {
    const managed = this.sessions.get(processId);
    if (!managed) return null;
    return { cwd: managed.cwd, sessionId: managed.sessionId };
  }
}

export const claudeProcessManager = new ClaudeProcessManager();
