import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import path from 'path';
import { createRequire } from 'module';
import { app } from 'electron';
import fs from 'fs';

// Debug log helper — console only (no file writes)
function debugLog(...args: unknown[]) {
  console.log('[claude-process]', ...args);
}

debugLog('claude-process module loaded, isPackaged:', app?.isPackaged);

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

  if (app?.isPackaged) {
    // In production: cli.js MUST be from the unpacked directory because
    // it's spawned as a child process (node can't execute files inside asar)
    // Priority: unpacked > resources
    const unpackedBase = path.join(
      app.getAppPath() + '.unpacked',
      'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js'
    );
    candidates.push(unpackedBase);

    const resourceBase = path.join(
      process.resourcesPath || '',
      'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js'
    );
    candidates.push(resourceBase);
  }

  // Dev: use createRequire to resolve from the SDK package
  try {
    const req = createRequire(import.meta.url || __filename);
    const sdkMain = req.resolve('@anthropic-ai/claude-agent-sdk');
    const resolved = path.join(path.dirname(sdkMain), 'cli.js');
    // If inside asar, convert to unpacked path
    if (resolved.includes('app.asar' + path.sep)) {
      candidates.push(resolved.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep));
    }
    candidates.push(resolved);
  } catch {
    // SDK not resolvable via createRequire
  }

  // Dev fallback: project root node_modules
  candidates.push(path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js'));

  for (const candidate of candidates) {
    try {
      // Use fs.statSync on the real filesystem (not asar-patched)
      // For unpacked paths, they exist on disk; for asar paths, they don't
      if (fs.existsSync(candidate) && !candidate.includes('app.asar' + path.sep)) {
        sdkCliPath = candidate;
        debugLog('Resolved SDK cli.js:', sdkCliPath);
        return sdkCliPath;
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  // Last resort — return first candidate
  sdkCliPath = candidates[0] || 'cli.js';
  debugLog('SDK cli.js (fallback):', sdkCliPath);
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
  permissionMode?: string;
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
    envVars?: Array<{ key: string; value: string; enabled: boolean }>,
  ): Promise<string> {
    debugLog('spawn called — cwd:', cwd, 'sessionId:', sessionId, 'permissionMode:', permissionMode, 'envVars:', envVars?.length || 0);

    // Apply enabled env vars to process.env so the SDK child process inherits them
    if (envVars && envVars.length > 0) {
      for (const { key, value, enabled } of envVars) {
        if (enabled && key && value) {
          process.env[key] = value;
          debugLog('set env:', key, '=', key.includes('KEY') || key.includes('TOKEN') ? '***' : value);
        }
      }
    }

    const processId = randomUUID();
    const abortController = new AbortController();

    const managed: ManagedSession = {
      cwd,
      sessionId,
      permissionMode,
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
      // Capture stderr for debugging — must be a callback function
      stderr: (data: string) => {
        debugLog('SDK stderr:', data);
      },
    };

    debugLog('SDK cli path:', getSdkCliPath());
    debugLog('cwd:', managed.cwd);
    debugLog('PATH:', process.env.PATH?.split(':').slice(0, 10).join(':'));

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
      // Auto-allow everything in bypassPermissions / dontAsk modes
      if (managed.permissionMode === 'bypassPermissions' || managed.permissionMode === 'dontAsk') {
        debugLog('canUseTool auto-allow (mode:', managed.permissionMode, '):', toolName);
        return { behavior: 'allow', updatedInput: input };
      }

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
        // Log all messages for debugging
        debugLog('message:', JSON.stringify(message).slice(0, 500));

        // Forward SDK messages to renderer (same format as stream-json)
        this.emit('message', processId, message);

        // Track session ID
        if (message.type === 'system' && (message as any).subtype === 'init') {
          managed.sessionId = (message as any).session_id;
        }

        // Check if result
        if (message.type === 'result') {
          // Log full result for debugging (especially error_during_execution)
          debugLog('result details:', JSON.stringify(message).slice(0, 2000));
          if ((message as any).subtype === 'error_during_execution' || (message as any).is_error) {
            debugLog('⚠ result is an error:', (message as any).subtype, (message as any).result);
          }
          break;
        }
      }

      // Clean exit
      this.emit('exit', processId, 0, null);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        this.emit('exit', processId, 0, 'SIGTERM');
      } else {
        const errDetail = [
          err?.message || String(err),
          err?.stderr ? `\nstderr: ${err.stderr}` : '',
          err?.cause ? `\ncause: ${err.cause}` : '',
          err?.code ? `\ncode: ${err.code}` : '',
        ].join('');
        debugLog('Query error:', errDetail);
        this.emit('error', processId, errDetail);
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
      parent_tool_use_id: null,
      session_id: managed.sessionId || '',
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
      managed.permissionMode = mode;
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
