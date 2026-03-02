import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import { getClaudeBinary, getSessionsDir, encodePath } from './platform';

// Console-only log (internal diagnostics, not shown in renderer debug panel)
function consoleLog(...args: unknown[]) {
  console.log('[claude-process]', ...args);
}

// Log to both console AND renderer debug panel.
// Use `detail` for large payloads (JSON) — they render as collapsible sections.
function debugLog(message: string, detail?: unknown, level: 'info' | 'warn' | 'error' = 'info') {
  const detailStr = detail !== undefined
    ? (typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail))
    : undefined;
  console.log('[claude-process]', message, detailStr ?? '');

  try {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send('debug-log', {
        category: 'claude',
        message,
        detail: detailStr,
        level,
      });
    }
  } catch {
    // Ignore errors if window is not ready
  }
}

consoleLog('module loaded, isPackaged:', app?.isPackaged);

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
  language?: string;
  envVars?: Array<{ key: string; value: string; enabled: boolean }>;
  includeCoAuthoredBy?: boolean;
  childProcess?: ChildProcess;
  stdinWriter?: (msg: object) => void;
  pendingControlResponses: Map<string, (response: any) => void>;
  permissionResolvers: Map<string, (result: PermissionResponse) => void>;
  messageCount: number; // Track messages sent to detect follow-ups
  initResolver?: () => void; // Resolves when CLI is initialized
  initFailed?: boolean; // Set if initialization failed
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
    language?: string,
    mcpServers?: Array<{ id: string; name: string; command: string; args: string[]; env: Record<string, string>; enabled: boolean }>,
    includeCoAuthoredBy?: boolean,
  ): Promise<string> {
    debugLog('Spawning CLI', { cwd, sessionId, permissionMode, mcpServers: mcpServers?.length || 0 });

    const processId = randomUUID();

    // Create a promise that resolves when CLI initialization is complete
    let initResolver!: () => void;
    const initPromise = new Promise<void>((resolve) => {
      initResolver = resolve;
    });

    const managed: ManagedSession = {
      cwd,
      sessionId,
      permissionMode,
      language,
      envVars,
      includeCoAuthoredBy,
      pendingControlResponses: new Map(),
      permissionResolvers: new Map(),
      messageCount: 0,
      initResolver,
    };
    this.sessions.set(processId, managed);

    // Start the CLI process in background
    this._runCli(processId, managed, permissionMode, mcpServers).catch((err) => {
      this.emit('error', processId, err?.message || String(err));
      managed.initFailed = true;
      initResolver(); // Resolve anyway to prevent hanging
    });

    // Wait for initialization with a timeout (60 seconds should be plenty)
    const timeoutMs = 60000;
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`CLI initialization timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([initPromise, timeoutPromise]);
      if (managed.initFailed) {
        throw new Error('CLI initialization failed');
      }
      debugLog(`CLI initialized — processId: ${processId}`);
    } catch (err) {
      // Clean up the session if initialization failed
      this.sessions.delete(processId);
      throw err;
    }

    return processId;
  }

  private async _runCli(
    processId: string,
    managed: ManagedSession,
    permissionMode?: string,
    mcpServers?: Array<{ id: string; name: string; command: string; args: string[]; env: Record<string, string>; enabled: boolean }>,
  ) {
    // Build language instruction for system prompt
    const langMap: Record<string, string> = {
      'zh-CN': 'Simplified Chinese (简体中文)',
      'zh-TW': 'Traditional Chinese (繁體中文)',
      'ja': 'Japanese (日本語)',
      'ko': 'Korean (한국어)',
      'en': 'English',
      'es': 'Spanish (Español)',
      'fr': 'French (Français)',
      'de': 'German (Deutsch)',
      'pt': 'Portuguese (Português)',
      'ru': 'Russian (Русский)',
    };
    const lang = managed.language && managed.language !== 'auto' ? managed.language : '';
    const langInstruction = lang && langMap[lang]
      ? `IMPORTANT: Always respond in ${langMap[lang]}. All explanations, comments, and conversation must be in ${langMap[lang]}.`
      : '';

    // Build env for the CLI child process:
    // IMPORTANT: We redirect CLAUDE_CONFIG_DIR to an isolated directory that
    // symlinks everything from ~/.claude/ EXCEPT settings.json (which would
    // override our profile env vars).
    //
    // Step 1: Start with process.env but REMOVE all API-related vars so stale
    //         credentials from the shell don't leak into the CLI child process.
    // Step 2: Overlay only the profile's env vars.
    // Step 3: Set CLAUDE_CONFIG_DIR to isolated config dir.
    const childEnv: Record<string, string | undefined> = { ...process.env };

    // Redirect CLAUDE_CONFIG_DIR to an isolated directory to prevent
    // ~/.claude/settings.json env vars from overriding profile config
    const isolatedConfigDir = path.join(app.getPath('userData'), 'sdk-config');
    const realClaudeDir = path.join(os.homedir(), '.claude');
    try {
      if (!fs.existsSync(isolatedConfigDir)) {
        fs.mkdirSync(isolatedConfigDir, { recursive: true });
      }
      // Sync symlinks: link everything from ~/.claude/ except settings.json
      if (fs.existsSync(realClaudeDir)) {
        const entries = fs.readdirSync(realClaudeDir);
        for (const entry of entries) {
          if (entry === 'settings.json') continue; // Skip — this is what we want to isolate
          const linkPath = path.join(isolatedConfigDir, entry);
          const targetPath = path.join(realClaudeDir, entry);
          try {
            const linkStat = fs.lstatSync(linkPath);
            // If it's a symlink, check if it still points to the right target
            if (linkStat.isSymbolicLink()) {
              const existing = fs.readlinkSync(linkPath);
              if (existing === targetPath) continue; // Already correct
              fs.unlinkSync(linkPath); // Wrong target, recreate
            } else {
              continue; // Real file/dir in isolated dir, don't touch
            }
          } catch {
            // linkPath doesn't exist, create it
          }
          fs.symlinkSync(targetPath, linkPath);
        }
      }
      // Write settings.json with includeCoAuthoredBy from profile.
      // This setting can only be set via settings.json (not env vars), so we
      // must write it to the isolated config dir for the CLI to pick it up.
      const isolatedSettings = path.join(isolatedConfigDir, 'settings.json');
      const settingsContent: Record<string, unknown> = {};
      if (managed.includeCoAuthoredBy !== undefined) {
        settingsContent.includeCoAuthoredBy = managed.includeCoAuthoredBy;
      }
      fs.writeFileSync(isolatedSettings, JSON.stringify(settingsContent, null, 2) + '\n');
      childEnv.CLAUDE_CONFIG_DIR = isolatedConfigDir;
      consoleLog('CLAUDE_CONFIG_DIR set to isolated dir:', isolatedConfigDir);
    } catch (e) {
      consoleLog('Failed to set up isolated config dir, falling back:', e);
    }

    // Clean API-related env vars inherited from the shell/parent process
    // to ensure ONLY profile env vars determine auth and endpoint config
    const apiEnvPrefixes = ['ANTHROPIC_', 'OPENAI_', 'CLAUDE_CODE_', 'CLAUDE_MODEL'];
    const cleanedKeys: string[] = [];
    for (const key of Object.keys(childEnv)) {
      if (apiEnvPrefixes.some(prefix => key.startsWith(prefix))) {
        cleanedKeys.push(key);
        delete childEnv[key];
      }
    }
    if (cleanedKeys.length > 0) {
      consoleLog('Cleaned inherited env vars:', cleanedKeys.join(', '));
    }

    // Now overlay the active profile's env vars — these are the ONLY source of truth
    if (managed.envVars && managed.envVars.length > 0) {
      for (const { key, value, enabled } of managed.envVars) {
        if (enabled && key && value) {
          childEnv[key] = value;
        }
      }
    }

    // Log CLI configuration for debugging
    const effectiveBaseUrl = childEnv.ANTHROPIC_BASE_URL || childEnv.OPENAI_BASE_URL || '(default: api.anthropic.com)';

    // Mask sensitive keys: show first 4 and last 4 chars, rest as asterisks
    const maskKey = (key: string | undefined, prefix: string): string => {
      if (!key) return '(none)';
      if (key.length <= 8) return `${prefix}=${key.slice(0, 2)}${'*'.repeat(key.length - 2)}`;
      const visibleChars = 4;
      const maskedLength = key.length - visibleChars * 2;
      return `${prefix}=${key.slice(0, visibleChars)}${'*'.repeat(maskedLength)}${key.slice(-visibleChars)}`;
    };

    const effectiveApiKey = childEnv.ANTHROPIC_API_KEY
      ? maskKey(childEnv.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY')
      : childEnv.ANTHROPIC_AUTH_TOKEN
        ? maskKey(childEnv.ANTHROPIC_AUTH_TOKEN, 'ANTHROPIC_AUTH_TOKEN')
        : childEnv.OPENAI_API_KEY
          ? maskKey(childEnv.OPENAI_API_KEY, 'OPENAI_API_KEY')
          : '(no explicit key — will use default)';
    const effectiveModel = childEnv.ANTHROPIC_MODEL || childEnv.CLAUDE_MODEL || '(CLI default)';

    debugLog('CLI configuration', {
      baseUrl: effectiveBaseUrl,
      auth: effectiveApiKey,
      model: effectiveModel,
      envVars: (managed.envVars || []).filter(v => v.enabled).map(v => {
        if (v.key.includes('KEY') || v.key.includes('TOKEN')) {
          return `${v.key}=${maskKey(v.value, '').replace('=', '')}`;
        }
        return `${v.key}=${v.value}`;
      }),
    });

    // Extract model from env
    const modelFromEnv = childEnv.ANTHROPIC_MODEL;

    // Build CLI args
    const claudeBinary = getClaudeBinary();
    const args: string[] = [
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool', 'stdio',
    ];

    if (permissionMode && permissionMode !== 'default') {
      if (permissionMode === 'bypassPermissions') {
        args.push('--dangerously-skip-permissions');
      } else {
        args.push('--permission-mode', permissionMode);
      }
    }
    if (managed.sessionId) {
      args.push('--resume', managed.sessionId);
    }
    if (modelFromEnv) {
      args.push('--model', modelFromEnv);
    }
    if (langInstruction) {
      args.push('--append-system-prompt', langInstruction);
    }

    // Build MCP server config — pass via --mcp-config CLI flag so CLI manages
    // the MCP server processes directly (no sdkMcpServers / mcp_message relay needed)
    if (mcpServers && mcpServers.length > 0) {
      const enabledServers = mcpServers.filter((s) => s.enabled);
      if (enabledServers.length > 0) {
        const mcpConfig: Record<string, { type: string; command: string; args: string[]; env: Record<string, string> }> = {};
        for (const server of enabledServers) {
          mcpConfig[server.name] = {
            type: 'stdio',
            command: server.command,
            args: server.args,
            env: server.env,
          };
        }
        args.push('--mcp-config', JSON.stringify({ mcpServers: mcpConfig }));
        debugLog(`MCP servers: ${enabledServers.map((s) => s.name).join(', ')}`);
      }
    }

    consoleLog('CLI binary:', claudeBinary, 'args:', args.join(' '), 'cwd:', managed.cwd);

    // Spawn the CLI process
    const child = spawn(claudeBinary, args, {
      cwd: managed.cwd,
      env: childEnv as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    managed.childProcess = child;

    // Set up stdout reader BEFORE sending anything to stdin
    const rl = readline.createInterface({ input: child.stdout });
    let resultReceived = false;

    // stdin writer
    function writeLine(msg: object) {
      if (child.stdin.writable) {
        child.stdin.write(JSON.stringify(msg) + '\n');
      }
    }
    managed.stdinWriter = writeLine;

    // Send initialize control_request and register resolver so we know when CLI is ready
    const initRequestId = randomUUID();
    managed.pendingControlResponses.set(initRequestId, (response: any) => {
      debugLog('CLI initialized', response);
      // Resolve the init promise so spawn() can return
      if (managed.initResolver) {
        managed.initResolver();
        managed.initResolver = undefined;
      }
    });
    writeLine({
      type: 'control_request',
      request_id: initRequestId,
      request: {
        subtype: 'initialize',
        hooks: {},
        sdkMcpServers: [],
      },
    });
    debugLog('Sent initialize request');

    rl.on('line', (line) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }

      // Route control_response — CLI answering our requests
      if (msg.type === 'control_response') {
        const responseData = msg.response || msg;
        const reqId = responseData?.request_id || msg.request_id;
        debugLog(`control_response (reqId=${reqId}, pending=${managed.pendingControlResponses.size})`);
        if (reqId) {
          const resolver = managed.pendingControlResponses.get(reqId);
          if (resolver) {
            managed.pendingControlResponses.delete(reqId);
            resolver(responseData);
          }
        }
        return;
      }

      // Route control_request — CLI asking us for permission
      if (msg.type === 'control_request') {
        this.handleControlRequest(processId, managed, msg);
        return;
      }

      // Filter out noise (same as SDK does)
      if (msg.type === 'keep_alive') return;
      if (msg.type === 'streamlined_text') return;
      if (msg.type === 'streamlined_tool_use_summary') return;

      // Handle cancellation of pending permission requests
      if (msg.type === 'control_cancel_request') {
        const reqId = msg.request_id;
        if (reqId) {
          managed.permissionResolvers.delete(reqId);
        }
        return;
      }

      // Log content messages for debugging (skip high-frequency types)
      const skipLogTypes = ['stream_event', 'keep_alive', 'streamlined_text', 'streamlined_tool_use_summary'];
      if (!skipLogTypes.includes(msg.type)) {
        const label = msg.subtype ? `${msg.type}/${msg.subtype}` : msg.type;
        debugLog(`message: ${label}`, msg);
      }

      // Forward content messages to renderer
      this.emit('message', processId, msg);

      // Track session ID and log MCP tools
      if (msg.type === 'system' && msg.subtype === 'init') {
        managed.sessionId = msg.session_id;
        if (msg.tools && Array.isArray(msg.tools)) {
          debugLog(`MCP tools available: ${msg.tools.length}`, msg.tools.map((t: any) => t.name || t));
        }
        // Notify that CLI initialization is complete
        if (managed.initResolver) {
          managed.initResolver();
          managed.initResolver = undefined; // Only resolve once
        }
      }

      // Detect result
      if (msg.type === 'result') {
        resultReceived = true;
        const isError = msg.subtype === 'error_during_execution' || msg.is_error;
        debugLog(
          isError ? `Result error: ${msg.subtype}` : `Result: ${msg.subtype || 'success'}`,
          msg,
          isError ? 'error' : 'info',
        );
        this.emit('exit', processId, 0, null);
      }
    });

    // Capture stderr — shown in debug panel for visibility during CLI startup
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString().trimEnd();
      if (text) debugLog(`stderr: ${text}`);
    });

    // Handle process close
    child.on('close', (code, signal) => {
      debugLog(`CLI process exited (code=${code}, signal=${signal})`);
      if (!resultReceived) {
        this.emit('exit', processId, code ?? 1, signal);
      }
      this.sessions.delete(processId);
    });

    child.on('error', (err) => {
      debugLog(`CLI process error: ${err.message}`, undefined, 'error');
      this.emit('error', processId, err.message);
      this.emit('exit', processId, 1, null);
      this.sessions.delete(processId);
    });
  }

  private handleControlRequest(processId: string, managed: ManagedSession, msg: any) {
    const { request_id, request } = msg;
    const subtype = request?.subtype || 'unknown';
    debugLog(`control_request: ${subtype}`, request);

    if (subtype === 'can_use_tool') {
      // Auto-allow in bypass modes
      if (managed.permissionMode === 'bypassPermissions' || managed.permissionMode === 'dontAsk') {
        consoleLog('canUseTool auto-allow:', request.tool_name);
        managed.stdinWriter?.({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id,
            response: { behavior: 'allow', updatedInput: request.input, toolUseID: request.tool_use_id },
          },
        });
        return;
      }

      // Emit to renderer for user decision
      this.emit('permission-request', processId, {
        requestId: request_id,
        toolName: request.tool_name,
        input: request.input,
      } as PermissionRequest);

      // Store resolver that writes control_response to stdin
      managed.permissionResolvers.set(request_id, (response: PermissionResponse) => {
        managed.permissionResolvers.delete(request_id);
        managed.stdinWriter?.({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id,
            response: response.behavior === 'allow'
              ? { behavior: 'allow', updatedInput: response.updatedInput || request.input, toolUseID: request.tool_use_id }
              : { behavior: 'deny', message: response.message || 'User denied', toolUseID: request.tool_use_id },
          },
        });
      });
      return;
    }

    // Respond with success to any unhandled control_request types
    // (hook_callback, mcp_message, etc.) to prevent CLI from blocking on a timeout
    debugLog(`Unhandled control_request '${subtype}', responding with success`);
    managed.stdinWriter?.({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id,
        response: {},
      },
    });
  }

  sendMessage(processId: string, content: string): boolean {
    const managed = this.sessions.get(processId);
    if (!managed?.stdinWriter) {
      debugLog('sendMessage failed — no session or stdinWriter', undefined, 'warn');
      return false;
    }

    debugLog(`sendMessage (${content?.length} chars, followUp=${managed.messageCount > 0})`);

    const isFollowUp = managed.messageCount > 0;
    managed.messageCount++;

    // Write user message to CLI stdin
    managed.stdinWriter({
      type: 'user',
      session_id: managed.sessionId || '',
      message: { role: 'user', content: [{ type: 'text', text: content }] },
      parent_tool_use_id: null,
    });

    // Persist follow-up user messages to JSONL so they appear in session history.
    // The first message is written by the CLI itself, so we only append follow-ups.
    if (isFollowUp && managed.sessionId && managed.cwd) {
      try {
        const sessionsDir = getSessionsDir();
        const encoded = encodePath(managed.cwd);
        const jsonlPath = path.join(sessionsDir, encoded, `${managed.sessionId}.jsonl`);
        if (fs.existsSync(jsonlPath)) {
          const entry = {
            type: 'user',
            message: { role: 'user', content },
            uuid: randomUUID(),
            sessionId: managed.sessionId,
            timestamp: new Date().toISOString(),
          };
          fs.appendFileSync(jsonlPath, '\n' + JSON.stringify(entry));
          consoleLog('Appended follow-up user message to JSONL');
        }
      } catch (err: any) {
        consoleLog('Failed to append user message to JSONL:', err?.message);
      }
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
    if (!managed?.stdinWriter) return false;

    const requestId = randomUUID();
    return new Promise((resolve) => {
      managed.pendingControlResponses.set(requestId, () => {
        managed.permissionMode = mode;
        resolve(true);
      });
      managed.stdinWriter!({
        type: 'control_request',
        request_id: requestId,
        request: { subtype: 'set_permission_mode', mode },
      });
      // Timeout fallback
      setTimeout(() => {
        if (managed.pendingControlResponses.has(requestId)) {
          managed.pendingControlResponses.delete(requestId);
          managed.permissionMode = mode; // Still update locally
          resolve(false);
        }
      }, 5000);
    });
  }

  kill(processId: string): boolean {
    const managed = this.sessions.get(processId);
    console.log(`[claude-process] kill called for ${processId}, found=${!!managed}`);
    if (!managed) return false;

    // Send interrupt control_request first (graceful)
    if (managed.stdinWriter) {
      try {
        managed.stdinWriter({
          type: 'control_request',
          request_id: randomUUID(),
          request: { subtype: 'interrupt' },
        });
      } catch { /* stdin may already be closed */ }
    }

    // Kill the child process
    managed.childProcess?.kill('SIGTERM');

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
