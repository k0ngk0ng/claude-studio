import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import { claudeProcessManager } from './claude-process';
import { sessionManager } from './session-manager';
import { gitManager } from './git-manager';
import { fileManager } from './file-manager';
import { terminalManager } from './terminal-manager';
import { getPlatform, getClaudeBinary, getClaudeModel, checkDependencies, readClaudeConfig, writeClaudeConfig } from './platform';
import { registerAuthIpcHandlers } from './auth-ipc-handlers';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFile, execSync } from 'child_process';

// CDN base URL for update downloads (set via environment or fallback)
// Configure this to your Aliyun OSS CDN domain
const CDN_BASE_URL = process.env.CLAUDE_STUDIO_CDN_URL || '';

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return null;
  const wc = windows[0].webContents;
  return wc.isDestroyed() ? null : wc;
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

  ipcMain.handle(
    'sessions:fork',
    (_event, projectPath: string, sessionId: string, cutoffUuid: string) => {
      return sessionManager.forkSession(projectPath, sessionId, cutoffUuid);
    }
  );

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
    return fileManager.searchFiles(cwd, query);
  });

  ipcMain.handle('git:listFiles', async (_event, cwd: string) => {
    return fileManager.listFiles(cwd);
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

    terminalManager.onExit(id, () => {
      const wc = getWebContents();
      if (wc) {
        wc.send('terminal:exit', id);
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

  // ─── File ─────────────────────────────────────────────────────────
  ipcMain.handle('file:read', (_event, filePath: string, maxSize?: number) => {
    const limit = maxSize || 1024 * 512; // 512KB default
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > limit) {
        return { error: 'File too large', size: stat.size };
      }
      // Check if file is likely binary
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(Math.min(8192, stat.size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      // Simple binary detection: check for null bytes in first 8KB
      if (buf.includes(0)) {
        return { error: 'Binary file', size: stat.size };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content, size: stat.size };
    } catch (err: any) {
      return { error: err.message || 'Failed to read file' };
    }
  });

  // ─── App ──────────────────────────────────────────────────────────
  ipcMain.handle('app:getProjectPath', () => {
    return os.homedir();
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

  ipcMain.handle('app:getAgentSdkVersion', () => {
    try {
      const sdkPkgPath = require.resolve('@anthropic-ai/claude-agent-sdk/package.json');
      const sdkPkg = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf-8'));
      return sdkPkg.version || 'unknown';
    } catch {
      return 'not installed';
    }
  });

  ipcMain.handle('app:getClaudeCodeVersion', () => {
    // Try 1: run `claude --version` from the global CLI
    try {
      const claudePath = getClaudeBinary();
      const raw = execSync(`${claudePath} --version`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      // Output is like "2.1.33 (Claude Code)" — extract just the version number
      const version = raw.split(/\s/)[0];
      if (version) return version;
    } catch {
      // fall through
    }
    // Try 2: read version from SDK's manifest.json
    try {
      const manifestPath = require.resolve('@anthropic-ai/claude-agent-sdk/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.version) return manifest.version;
    } catch {
      // fall through
    }
    // Try 3: read claudeCodeVersion from SDK's package.json
    try {
      const sdkPkgPath = require.resolve('@anthropic-ai/claude-agent-sdk/package.json');
      const sdkPkg = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf-8'));
      if (sdkPkg.claudeCodeVersion) return sdkPkg.claudeCodeVersion;
    } catch {
      // fall through
    }
    return 'not found';
  });

  ipcMain.handle('app:getGitVersion', () => {
    try {
      const raw = execSync('git --version', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      // Output is like "git version 2.43.0" — extract version number
      const match = raw.match(/(\d+\.\d+[\.\d]*)/);
      return match ? match[1] : raw;
    } catch {
      return 'not found';
    }
  });

  ipcMain.handle('app:installClaudeCode', async () => {
    const platform = getPlatform();
    const wc = getWebContents();
    try {
      const cmd = platform === 'windows'
        ? 'npm install -g @anthropic-ai/claude-code'
        : 'npm install -g @anthropic-ai/claude-code';
      await new Promise<void>((resolve, reject) => {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const child = execFile(npmCmd, ['install', '-g', '@anthropic-ai/claude-code'], {
          timeout: 120000,
          env: { ...process.env },
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
        child.stdout?.on('data', (data: string) => {
          if (wc) wc.send('app:install-output', data.toString());
        });
        child.stderr?.on('data', (data: string) => {
          if (wc) wc.send('app:install-output', data.toString());
        });
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('app:installGit', async () => {
    const platform = getPlatform();
    try {
      if (platform === 'mac') {
        // macOS: use xcode-select --install (triggers Xcode Command Line Tools)
        execFile('xcode-select', ['--install']);
        return { success: true, message: 'Xcode Command Line Tools installer launched. Please follow the on-screen instructions.' };
      } else if (platform === 'windows') {
        // Windows: open the Git for Windows download page
        await shell.openExternal('https://git-scm.com/download/win');
        return { success: true, message: 'Git download page opened. Please download and install Git for Windows.' };
      } else {
        // Linux: try common package managers
        const wc = getWebContents();
        // Try apt first, then dnf, then pacman
        const commands = [
          { check: 'apt', cmd: 'sudo', args: ['apt', 'install', '-y', 'git'] },
          { check: 'dnf', cmd: 'sudo', args: ['dnf', 'install', '-y', 'git'] },
          { check: 'pacman', cmd: 'sudo', args: ['pacman', '-S', '--noconfirm', 'git'] },
        ];
        for (const c of commands) {
          try {
            execSync(`which ${c.check}`, { stdio: 'pipe' });
            await new Promise<void>((resolve, reject) => {
              const child = execFile(c.cmd, c.args, { timeout: 120000 }, (err) => {
                if (err) reject(err);
                else resolve();
              });
              child.stdout?.on('data', (data: string) => {
                if (wc) wc.send('app:install-output', data.toString());
              });
              child.stderr?.on('data', (data: string) => {
                if (wc) wc.send('app:install-output', data.toString());
              });
            });
            return { success: true };
          } catch {
            continue;
          }
        }
        // Fallback: open download page
        await shell.openExternal('https://git-scm.com/downloads');
        return { success: true, message: 'Git download page opened. Please install Git manually.' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      const https = require('https');
      const data: string = await new Promise((resolve, reject) => {
        https.get('https://api.github.com/repos/k0ngk0ng/claude-studio/releases/latest', {
          headers: { 'User-Agent': 'claude-studio', 'Accept': 'application/vnd.github.v3+json' },
        }, (res: any) => {
          let body = '';
          res.on('data', (chunk: string) => { body += chunk; });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        }).on('error', reject);
      });
      const release = JSON.parse(data);
      const tagName = release.tag_name || '';

      // Try to fetch CDN URLs from OSS
      let cdnUrls: Record<string, string> = {};
      if (CDN_BASE_URL) {
        try {
          const cdnData: string = await new Promise((resolve, reject) => {
            const cdnJsonUrl = `${CDN_BASE_URL}/claude-studio/releases/${tagName}/cdn-urls.json`;
            const mod = cdnJsonUrl.startsWith('https') ? https : require('http');
            mod.get(cdnJsonUrl, { timeout: 5000 }, (res: any) => {
              if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
              let body = '';
              res.on('data', (chunk: string) => { body += chunk; });
              res.on('end', () => resolve(body));
              res.on('error', reject);
            }).on('error', reject);
          });
          const parsed = JSON.parse(cdnData);
          cdnUrls = parsed.files || {};
        } catch {
          // CDN not available, will use GitHub URLs only
        }
      }

      return {
        version: tagName.replace(/^v/, ''),
        tagName,
        name: release.name,
        body: release.body,
        htmlUrl: release.html_url,
        assets: (release.assets || []).map((a: any) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
          cdnUrl: cdnUrls[a.name] || null,
        })),
      };
    } catch (err: any) {
      throw new Error(`Failed to check for updates: ${err?.message}`);
    }
  });

  ipcMain.handle('app:downloadUpdate', async (_event, downloadUrl: string, fileName: string) => {
    const https = require('https');
    const downloadDir = path.join(os.homedir(), 'Downloads');
    const filePath = path.join(downloadDir, fileName);

    return new Promise<string>((resolve, reject) => {
      let currentReq: any = null;
      let fileStream: fs.WriteStream | null = null;
      let aborted = false;

      // Abort download if app is quitting
      const onBeforeQuit = () => {
        aborted = true;
        if (currentReq) {
          try { currentReq.destroy(); } catch {}
        }
        if (fileStream) {
          try { fileStream.end(); } catch {}
        }
      };
      app.once('before-quit', onBeforeQuit);

      const cleanup = () => {
        app.removeListener('before-quit', onBeforeQuit);
      };

      const follow = (url: string) => {
        currentReq = https.get(url, {
          headers: { 'User-Agent': 'claude-studio' },
        }, (res: any) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            follow(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            cleanup();
            reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            return;
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          fileStream = fs.createWriteStream(filePath);

          res.on('data', (chunk: Buffer) => {
            if (aborted) return;
            downloaded += chunk.length;
            fileStream?.write(chunk);
            try {
              const wc = getWebContents();
              if (wc && totalSize > 0) {
                const progress = Math.min(Math.round((downloaded / totalSize) * 100), 99);
                wc.send('app:download-progress', { downloaded, totalSize, progress });
              }
            } catch {}
          });

          res.on('end', () => {
            if (aborted) {
              cleanup();
              return;
            }
            fileStream?.end(() => {
              try {
                const wc = getWebContents();
                if (wc && totalSize > 0) {
                  wc.send('app:download-progress', { downloaded: totalSize, totalSize, progress: 100 });
                }
              } catch {}
              cleanup();
              resolve(filePath);
            });
          });

          res.on('error', (err: Error) => {
            fileStream?.end();
            try { fs.unlinkSync(filePath); } catch {}
            cleanup();
            reject(err);
          });
        }).on('error', (err: Error) => {
          cleanup();
          if (!aborted) reject(err);
        });
      };
      follow(downloadUrl);
    });
  });

  ipcMain.handle('app:installUpdate', async (_event, filePath: string) => {
    try {
      const platform = getPlatform();
      if (platform === 'mac') {
        // Open the .dmg or .zip file
        await shell.openPath(filePath);
      } else if (platform === 'windows') {
        // Run the installer
        await shell.openPath(filePath);
      } else {
        // Linux: open the file
        await shell.openPath(filePath);
      }
      // Quit the app so user can install
      setTimeout(() => app.quit(), 1000);
      return true;
    } catch {
      return false;
    }
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
          } else {
            // Linux: try common terminal emulators
            execFile('xdg-open', [cwd]);
          }
          return true;
        }
        case 'cmd':
          execFile('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${cwd}"`], { shell: true });
          return true;
        case 'wt':
          execFile('wt', ['-d', cwd], { shell: true });
          return true;
        case 'powershell':
          execFile('pwsh', ['-NoExit', '-Command', `Set-Location '${cwd}'`], { shell: true });
          return true;
        case 'notepad':
          execFile('notepad', [cwd], { shell: true });
          return true;
        case 'vscode':
          execFile('code', [cwd], winShell);
          return true;
        case 'cursor':
          execFile('cursor', [cwd], winShell);
          return true;
        case 'zed':
          if (platform === 'mac') {
            execFile('open', ['-a', 'Zed', cwd]);
          } else {
            execFile('zed', [cwd], winShell);
          }
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
        case 'iterm':
          execFile('open', ['-a', 'iTerm', cwd]);
          return true;
        case 'notepad':
          execFile('notepad', [cwd], { shell: true });
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

    if (platform === 'mac') {
      editors.push({ id: 'terminal', name: 'Terminal' });
    } else if (platform === 'windows') {
      editors.push({ id: 'cmd', name: 'CMD' });
    } else {
      editors.push({ id: 'terminal', name: 'Terminal' });
    }

    // Mac-only: check for terminal apps (right after Terminal)
    if (platform === 'mac') {
      const terminalApps = [
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app' },
      ];
      for (const tApp of terminalApps) {
        try {
          await fs.promises.access(tApp.path);
          editors.push({ id: tApp.id, name: tApp.name });
        } catch {
          // App not found, skip
        }
      }
    }

    // Windows-only: Terminal (Windows Terminal), PowerShell, Notepad
    if (platform === 'windows') {
      // Windows Terminal (wt.exe)
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('where', ['wt'], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        editors.push({ id: 'wt', name: 'Terminal' });
      } catch {
        // Windows Terminal not found
      }
      // PowerShell
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('where', ['pwsh'], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        editors.push({ id: 'powershell', name: 'PowerShell' });
      } catch {
        // Try legacy powershell
        try {
          await new Promise<void>((resolve, reject) => {
            execFile('where', ['powershell'], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          editors.push({ id: 'powershell', name: 'PowerShell' });
        } catch {
          // PowerShell not found
        }
      }
      editors.push({ id: 'notepad', name: 'Notepad' });
    }

    // Check for common editors (CLI-based detection)
    const editorChecks = [
      { id: 'vscode', name: 'VS Code', cmd: 'code' },
      { id: 'cursor', name: 'Cursor', cmd: 'cursor' },
      { id: 'idea', name: 'IntelliJ IDEA', cmd: 'idea' },
      { id: 'webstorm', name: 'WebStorm', cmd: 'webstorm' },
    ];

    // Zed has CLI on Linux/Windows but not on Mac
    if (platform !== 'mac') {
      editorChecks.push({ id: 'zed', name: 'Zed', cmd: 'zed' });
    }

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

    // Mac-only: check for apps without CLI commands
    if (platform === 'mac') {
      const macApps = [
        { id: 'zed', name: 'Zed', path: '/Applications/Zed.app' },
      ];
      for (const macApp of macApps) {
        // Skip if already found via CLI
        if (editors.some(e => e.id === macApp.id)) continue;
        try {
          await fs.promises.access(macApp.path);
          editors.push({ id: macApp.id, name: macApp.name });
        } catch {
          // App not found, skip
        }
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
          fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'claude-studio-runtime', private: true }, null, 2));
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

  // ─── App Settings (~/.claude-studio/settings.json) ──────────────────
  const settingsDir = path.join(os.homedir(), '.claude-studio');
  const settingsFile = path.join(settingsDir, 'settings.json');

  // Migrate from old ~/.claude-app/ directory if it exists and new one doesn't
  const oldSettingsDir = path.join(os.homedir(), '.claude-app');
  const oldSettingsFile = path.join(oldSettingsDir, 'settings.json');
  if (!fs.existsSync(settingsFile) && fs.existsSync(oldSettingsFile)) {
    try {
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }
      fs.copyFileSync(oldSettingsFile, settingsFile);
      console.log('Migrated settings from ~/.claude-app/ to ~/.claude-studio/');
    } catch (err) {
      console.warn('Failed to migrate settings from ~/.claude-app/:', err);
    }
  }

  ipcMain.handle('settings:read', async () => {
    try {
      if (!fs.existsSync(settingsFile)) {
        return null;
      }
      const raw = fs.readFileSync(settingsFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle('settings:write', async (_event, data: Record<string, unknown>) => {
    try {
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }
      fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  });

  // ─── Git push ─────────────────────────────────────────────────────
  ipcMain.handle('git:push', async (_event, cwd: string) => {
    return gitManager.push(cwd);
  });

  ipcMain.handle('git:pushTags', async (_event, cwd: string) => {
    return gitManager.pushTags(cwd);
  });

  // ─── File operations ─────────────────────────────────────────────
  ipcMain.handle('app:showItemInFolder', (_event, fullPath: string) => {
    try {
      // showItemInFolder works for files; for directories, open the directory itself
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        shell.openPath(fullPath);
      } else {
        shell.showItemInFolder(fullPath);
      }
      return true;
    } catch (err: any) {
      console.error('showItemInFolder failed:', fullPath, err?.message);
      return false;
    }
  });

  ipcMain.handle('app:openFile', async (_event, fullPath: string) => {
    try {
      const result = await shell.openPath(fullPath);
      // shell.openPath returns empty string on success, error message on failure
      if (result) {
        console.error('openFile failed:', fullPath, result);
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('openFile error:', fullPath, err?.message);
      return false;
    }
  });

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  // ─── Skills (~/.claude/skills/) ─────────────────────────────────────
  const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  ipcMain.handle('skills:list', async () => {
    const skills: {
      name: string; description: string; content: string;
      dirPath: string; filePath: string; hasTemplate: boolean; hasReferences: boolean;
    }[] = [];

    if (!fs.existsSync(globalSkillsDir)) return skills;

    const entries = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      const dirPath = path.join(globalSkillsDir, entry.name);
      // Follow symlinks
      let isDir = false;
      try {
        const stat = fs.statSync(dirPath);
        isDir = stat.isDirectory();
      } catch { continue; }
      if (!isDir) continue;

      const skillFile = path.join(dirPath, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      let content = '';
      try { content = fs.readFileSync(skillFile, 'utf-8'); } catch { continue; }

      let description = '';
      // Parse YAML frontmatter
      if (content.startsWith('---')) {
        const endIdx = content.indexOf('---', 3);
        if (endIdx !== -1) {
          const frontmatter = content.substring(3, endIdx);
          const descMatch = frontmatter.match(/description:\s*(.+)/);
          if (descMatch) description = descMatch[1].trim();
        }
      }
      // Fallback: first heading or non-empty line
      if (!description) {
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && trimmed !== '---') {
            description = trimmed.startsWith('#') ? trimmed.replace(/^#+\s*/, '') : trimmed;
            break;
          }
        }
      }

      skills.push({
        name: entry.name,
        description,
        content,
        dirPath,
        filePath: skillFile,
        hasTemplate: fs.existsSync(path.join(dirPath, 'CLAUDE.md.template')),
        hasReferences: fs.existsSync(path.join(dirPath, 'references')),
      });
    }

    return skills;
  });

  ipcMain.handle('skills:read', async (_event, filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8');
  });

  ipcMain.handle('skills:create', async (_event, name: string, content: string) => {
    try {
      const dirPath = path.join(globalSkillsDir, name);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(path.join(dirPath, 'SKILL.md'), content, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('skills:create failed:', err?.message);
      return false;
    }
  });

  ipcMain.handle('skills:update', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('skills:update failed:', err?.message);
      return false;
    }
  });

  ipcMain.handle('skills:remove', async (_event, dirPath: string) => {
    try {
      // Check if it's a symlink — just remove the link
      const lstat = fs.lstatSync(dirPath);
      if (lstat.isSymbolicLink()) {
        fs.unlinkSync(dirPath);
      } else {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
      return true;
    } catch (err: any) {
      console.error('skills:remove failed:', err?.message);
      return false;
    }
  });

  // ─── Commands (~/.claude/commands/) ────────────────────────────────
  const globalCommandsDir = path.join(os.homedir(), '.claude', 'commands');

  function parseCommandFile(filePath: string): {
    name: string; fileName: string; type: 'md' | 'sh';
    description: string; argumentHint: string; content: string; filePath: string;
  } {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).slice(1) as 'md' | 'sh';
    const name = path.basename(fileName, path.extname(fileName));
    let content = '';
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch {}

    let description = '';
    let argumentHint = '';

    if (ext === 'md' && content.startsWith('---')) {
      const endIdx = content.indexOf('---', 3);
      if (endIdx !== -1) {
        const frontmatter = content.substring(3, endIdx);
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        const hintMatch = frontmatter.match(/argument-hint:\s*(.+)/);
        if (descMatch) description = descMatch[1].trim();
        if (hintMatch) argumentHint = hintMatch[1].trim();
      }
    }

    if (!description) {
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && trimmed !== '---' && !trimmed.startsWith('#!')) {
          description = trimmed.startsWith('#') ? trimmed.replace(/^#+\s*/, '') : trimmed;
          break;
        }
      }
    }

    return { name, fileName, type: ext, description, argumentHint, content, filePath };
  }

  ipcMain.handle('commands:list', async () => {
    const commands: ReturnType<typeof parseCommandFile>[] = [];

    if (!fs.existsSync(globalCommandsDir)) return commands;

    const files = fs.readdirSync(globalCommandsDir);
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === '.md' || ext === '.sh') {
        const fullPath = path.join(globalCommandsDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            commands.push(parseCommandFile(fullPath));
          }
        } catch {
          // Skip broken symlinks
        }
      }
    }

    return commands;
  });

  ipcMain.handle('commands:read', async (_event, filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8');
  });

  ipcMain.handle('commands:create', async (_event, fileName: string, content: string) => {
    try {
      if (!fs.existsSync(globalCommandsDir)) {
        fs.mkdirSync(globalCommandsDir, { recursive: true });
      }
      const filePath = path.join(globalCommandsDir, fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
      if (fileName.endsWith('.sh')) {
        fs.chmodSync(filePath, 0o755);
      }
      return true;
    } catch (err: any) {
      console.error('commands:create failed:', err?.message);
      return false;
    }
  });

  ipcMain.handle('commands:update', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('commands:update failed:', err?.message);
      return false;
    }
  });

  ipcMain.handle('commands:remove', async (_event, filePath: string) => {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err: any) {
      console.error('commands:remove failed:', err?.message);
      return false;
    }
  });

  // ─── Auth ────────────────────────────────────────────────────────
  registerAuthIpcHandlers();

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
