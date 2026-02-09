import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import { claudeProcessManager } from './claude-process';
import { sessionManager } from './session-manager';
import { gitManager } from './git-manager';
import { terminalManager } from './terminal-manager';
import { getPlatform, getClaudeModel, checkDependencies, readClaudeConfig, writeClaudeConfig } from './platform';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFile, execSync } from 'child_process';

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0].webContents : null;
}

export function registerIpcHandlers(): void {
  // ─── Claude Process ───────────────────────────────────────────────

  // Register global listeners ONCE — forward all events to renderer
  claudeProcessManager.on('message', (pid: string, message: unknown) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('claude:message', pid, message);
    }
  });

  claudeProcessManager.on('exit', (pid: string, code: number, signal: string) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('claude:message', pid, {
        type: 'exit',
        code,
        signal,
      });
    }
  });

  claudeProcessManager.on('error', (pid: string, errorMsg: string) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('claude:message', pid, {
        type: 'error',
        message: { role: 'system', content: errorMsg },
      });
    }
  });

  // Permission request from SDK canUseTool → forward to renderer
  claudeProcessManager.on('permission-request', (pid: string, request: unknown) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('claude:permission-request', pid, request);
    }
  });

  ipcMain.handle('claude:spawn', async (_event, cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string) => {
    return claudeProcessManager.spawn(cwd, sessionId, permissionMode, envVars, language);
  });

  ipcMain.handle('claude:send', (_event, processId: string, content: string) => {
    return claudeProcessManager.sendMessage(processId, content);
  });

  ipcMain.handle('claude:kill', (_event, processId: string) => {
    return claudeProcessManager.kill(processId);
  });

  // Permission response from renderer → forward to SDK canUseTool resolver
  ipcMain.handle('claude:permission-response', (_event, processId: string, requestId: string, response: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }) => {
    return claudeProcessManager.respondToPermission(processId, requestId, response);
  });

  // Runtime permission mode change
  ipcMain.handle('claude:setPermissionMode', async (_event, processId: string, mode: string) => {
    return claudeProcessManager.setPermissionMode(processId, mode);
  });

  // ─── Sessions ─────────────────────────────────────────────────────
  ipcMain.handle('sessions:list', () => {
    return sessionManager.getAllSessions();
  });

  ipcMain.handle(
    'sessions:getMessages',
    (_event, projectPath: string, sessionId: string) => {
      return sessionManager.getSessionMessages(projectPath, sessionId);
    }
  );

  ipcMain.handle('sessions:listProjects', () => {
    return sessionManager.listAllProjects();
  });

  // ─── Git ──────────────────────────────────────────────────────────
  ipcMain.handle('git:status', (_event, cwd: string) => {
    return gitManager.getStatus(cwd);
  });

  ipcMain.handle(
    'git:diff',
    (_event, cwd: string, file?: string, staged?: boolean) => {
      return gitManager.getDiff(cwd, file, staged);
    }
  );

  ipcMain.handle('git:stage', (_event, cwd: string, file: string) => {
    return gitManager.stageFile(cwd, file);
  });

  ipcMain.handle('git:unstage', (_event, cwd: string, file: string) => {
    return gitManager.unstageFile(cwd, file);
  });

  ipcMain.handle('git:commit', (_event, cwd: string, message: string) => {
    return gitManager.commit(cwd, message);
  });

  ipcMain.handle('git:branch', (_event, cwd: string) => {
    return gitManager.getCurrentBranch(cwd);
  });

  ipcMain.handle('git:listBranches', (_event, cwd: string) => {
    return gitManager.listBranches(cwd);
  });

  ipcMain.handle('git:checkout', (_event, cwd: string, branch: string) => {
    return gitManager.checkout(cwd, branch);
  });

  ipcMain.handle('git:createBranch', (_event, cwd: string, branch: string) => {
    return gitManager.createAndCheckout(cwd, branch);
  });

  ipcMain.handle('git:searchFiles', (_event, cwd: string, query: string) => {
    return gitManager.searchFiles(cwd, query);
  });

  ipcMain.handle('git:listFiles', (_event, cwd: string) => {
    return gitManager.listFiles(cwd);
  });

  // ─── Terminal ─────────────────────────────────────────────────────
  ipcMain.handle('terminal:create', (_event, cwd: string) => {
    const id = terminalManager.create(cwd);
    if (!id) return null;

    terminalManager.onData(id, (data: string) => {
      const wc = getWebContents();
      if (wc) {
        wc.send('terminal:data', id, data);
      }
    });

    return id;
  });

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    return terminalManager.write(id, data);
  });

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    return terminalManager.resize(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    return terminalManager.kill(id);
  });

  // ─── App ──────────────────────────────────────────────────────────
  ipcMain.handle('app:getProjectPath', () => {
    return process.cwd();
  });

  ipcMain.handle('app:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('app:getPlatform', () => {
    return getPlatform();
  });

  ipcMain.handle('app:getHomePath', () => {
    return os.homedir();
  });

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getModel', () => {
    return getClaudeModel();
  });

  ipcMain.handle('app:checkDependencies', () => {
    return checkDependencies();
  });

  ipcMain.handle('app:openInEditor', async (_event, cwd: string, editor: string) => {
    try {
      const platform = getPlatform();
      // On Windows, CLI tools like 'code', 'cursor' etc. are .cmd/.bat scripts
      // that require shell: true to execute properly
      const winShell = platform === 'windows' ? { shell: true } : {};

      switch (editor) {
        case 'finder':
          await shell.openPath(cwd);
          return true;
        case 'terminal': {
          if (platform === 'mac') {
            execFile('open', ['-a', 'Terminal', cwd]);
          } else if (platform === 'windows') {
            execFile('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${cwd}"`], { shell: true });
          } else {
            // Linux: try common terminal emulators
            execFile('xdg-open', [cwd]);
          }
          return true;
        }
        case 'vscode':
          execFile('code', [cwd], winShell);
          return true;
        case 'cursor':
          execFile('cursor', [cwd], winShell);
          return true;
        case 'windsurf':
          execFile('windsurf', [cwd], winShell);
          return true;
        case 'zed':
          execFile('zed', [cwd], winShell);
          return true;
        case 'idea':
          execFile('idea', [cwd], winShell);
          return true;
        case 'webstorm':
          execFile('webstorm', [cwd], winShell);
          return true;
        case 'xcode':
          execFile('open', ['-a', 'Xcode', cwd]);
          return true;
        default:
          execFile(editor, [cwd], winShell);
          return true;
      }
    } catch (err) {
      console.error(`Failed to open in ${editor}:`, err);
      return false;
    }
  });

  ipcMain.handle('app:getAvailableEditors', async () => {
    const platform = getPlatform();
    const editors: { id: string; name: string; icon?: string }[] = [];

    // Always available
    if (platform === 'mac') {
      editors.push({ id: 'finder', name: 'Finder' });
    } else if (platform === 'windows') {
      editors.push({ id: 'finder', name: 'Explorer' });
    } else {
      editors.push({ id: 'finder', name: 'File Manager' });
    }
    editors.push({ id: 'terminal', name: 'Terminal' });

    // Check for common editors
    const editorChecks = [
      { id: 'vscode', name: 'VS Code', cmd: 'code' },
      { id: 'cursor', name: 'Cursor', cmd: 'cursor' },
      { id: 'windsurf', name: 'Windsurf', cmd: 'windsurf' },
      { id: 'zed', name: 'Zed', cmd: 'zed' },
      { id: 'idea', name: 'IntelliJ IDEA', cmd: 'idea' },
      { id: 'webstorm', name: 'WebStorm', cmd: 'webstorm' },
    ];

    if (platform === 'mac') {
      editorChecks.push({ id: 'xcode', name: 'Xcode', cmd: 'xcode' });
    }

    const whichCmd = platform === 'windows' ? 'where' : 'which';

    for (const editor of editorChecks) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(whichCmd, [editor.cmd], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        editors.push({ id: editor.id, name: editor.name });
      } catch {
        // Editor not found, skip
      }
    }

    return editors;
  });

  // ─── Bootstrap: check & install runtime dependencies ─────────────
  ipcMain.handle('app:checkRuntimeDeps', async () => {
    // In packaged app, deps are bundled by forge hook — always report found
    if (app.isPackaged) {
      return [
        { name: '@anthropic-ai/claude-agent-sdk', found: true },
        { name: 'node-pty', found: true },
      ];
    }

    // Dev mode: actually check
    const results: { name: string; found: boolean; error?: string }[] = [];

    try {
      const sdkPath = path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');
      results.push({ name: '@anthropic-ai/claude-agent-sdk', found: fs.existsSync(sdkPath) });
    } catch {
      results.push({ name: '@anthropic-ai/claude-agent-sdk', found: false });
    }

    try {
      require('node-pty');
      results.push({ name: 'node-pty', found: true });
    } catch {
      results.push({ name: 'node-pty', found: false });
    }

    return results;
  });

  ipcMain.handle('app:installRuntimeDeps', async () => {
    // Determine where to install — use app's user data directory for production
    const isPackaged = app.isPackaged;
    let installDir: string;

    if (isPackaged) {
      // In production: install to a writable location alongside the app
      installDir = path.join(app.getPath('userData'), 'node_modules_runtime');
    } else {
      // In dev: install to project root
      installDir = process.cwd();
    }

    // Ensure directory exists
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    const depsToInstall = ['@anthropic-ai/claude-agent-sdk', 'node-pty'];
    const missing: string[] = [];

    // Check which deps are actually missing
    for (const dep of depsToInstall) {
      try {
        if (dep === '@anthropic-ai/claude-agent-sdk') {
          await import(dep);
        } else {
          require(dep);
        }
      } catch {
        missing.push(dep);
      }
    }

    if (missing.length === 0) {
      return { success: true, installed: [] };
    }

    // Find npm
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    try {
      // For packaged app: create a minimal package.json and install there
      if (isPackaged) {
        const pkgJsonPath = path.join(installDir, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) {
          fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'claude-app-runtime', private: true }, null, 2));
        }

        // Install missing deps
        await new Promise<void>((resolve, reject) => {
          const child = execFile(npmCmd, ['install', ...missing, '--no-save'], {
            cwd: installDir,
            timeout: 120000,
            env: { ...process.env, NODE_ENV: 'production' },
          }, (err) => {
            if (err) reject(err);
            else resolve();
          });
          child.stdout?.on('data', (data: string) => {
            const wc = getWebContents();
            if (wc) wc.send('app:install-progress', data.toString());
          });
          child.stderr?.on('data', (data: string) => {
            const wc = getWebContents();
            if (wc) wc.send('app:install-progress', data.toString());
          });
        });

        // Add the runtime node_modules to Node's module search path
        const runtimeNodeModules = path.join(installDir, 'node_modules');
        if (!require.resolve.paths('')?.includes(runtimeNodeModules)) {
          module.paths.unshift(runtimeNodeModules);
        }
      } else {
        // Dev mode: just npm install in project root
        await new Promise<void>((resolve, reject) => {
          execFile(npmCmd, ['install'], {
            cwd: installDir,
            timeout: 120000,
          }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      return { success: true, installed: missing };
    } catch (err: any) {
      return { success: false, installed: [], error: err?.message || String(err) };
    }
  });

  // ─── Claude Code config (~/.claude/settings.json) ─────────────────
  ipcMain.handle('claudeConfig:read', () => {
    return readClaudeConfig();
  });

  ipcMain.handle('claudeConfig:write', (_event, updates: Record<string, unknown>) => {
    writeClaudeConfig(updates);
    return true;
  });

  // ─── Git push ─────────────────────────────────────────────────────
  ipcMain.handle('git:push', async (_event, cwd: string) => {
    return gitManager.push(cwd);
  });

  ipcMain.handle('git:pushTags', async (_event, cwd: string) => {
    return gitManager.pushTags(cwd);
  });

  // ─── Auto-watch sessions directory for changes ────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  sessionManager.watchForChanges(() => {
    // Debounce: only notify renderer after 500ms of no changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const wc = getWebContents();
      if (wc) {
        wc.send('sessions:changed');
      }
    }, 500);
  });
}
