import { ipcMain, dialog, BrowserWindow, shell, app, powerSaveBlocker } from 'electron';
import { autoUpdater } from 'electron-updater';
import https from 'https';
import http from 'http';
import { claudeProcessManager } from './claude-process';
import { sessionManager } from './session-manager';
import { gitManager } from './git-manager';
import { fileManager } from './file-manager';
import { terminalManager } from './terminal-manager';
import { getPlatform, getClaudeBinary, getClaudeModel, checkDependencies, readClaudeConfig, writeClaudeConfig } from './platform';
import { registerAuthIpcHandlers } from './auth-ipc-handlers';
import { registerRemoteIpcHandlers, registerExternalHandler } from './remote-ipc-handlers';
import { mcpManager } from './mcp-manager';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFile, execSync, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// CDN base URL for update downloads (set via environment or fallback)
// Configure this to your Aliyun OSS CDN domain
const CDN_BASE_URL = process.env.ALIYUN_OSS_CDN_URL || process.env.CLAUDE_STUDIO_CDN_URL || '';

// GitHub repository info for updates
const GITHUB_OWNER = 'k0ngk0ng';
const GITHUB_REPO = 'claude-studio';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Configure electron-updater
autoUpdater.autoDownload = false; // We trigger download manually
autoUpdater.autoInstallOnAppQuit = true; // Install on restart

// Set GitHub as the update provider
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'k0ngk0ng',
  repo: 'claude-studio',
});

// Forward autoUpdater events to renderer
autoUpdater.on('checking-for-update', () => {
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', { state: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', { state: 'available', release: info });
});

autoUpdater.on('update-not-available', () => {
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', { state: 'up-to-date' });
});

autoUpdater.on('download-progress', (progress) => {
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', {
    state: 'downloading',
    progress: progress.percent,
    downloaded: progress.transferred,
    totalSize: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  updateState.isDownloaded = true;
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', { state: 'downloaded', release: info });
});

autoUpdater.on('error', (err) => {
  const wc = getWebContents();
  if (wc) wc.send('app:update-status', { state: 'error', message: err.message });
});

// ─── Auto-update logic ─────────────────────────────────────────────

// Store for update state
let updateState: {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  isDownloaded: boolean;
  autoDownloaded: boolean;  // Track if this was an auto-download
} = {
  currentVersion: app.getVersion(),
  latestVersion: null,
  isUpdateAvailable: false,
  isDownloaded: false,
  autoDownloaded: false,
};


function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return null;
  const wc = windows[0].webContents;
  return wc.isDestroyed() ? null : wc;
}

export function registerIpcHandlers(): void {
  // Helper: register with ipcMain AND the remote handler registry
  // so remote commands can invoke these handlers without internal API hacks.
  function handle(channel: string, handler: (event: any, ...args: any[]) => any): void {
    ipcMain.handle(channel, handler);
    registerExternalHandler(channel, handler);
  }

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

  // Permission request from CLI → forward to renderer
  claudeProcessManager.on('permission-request', (pid: string, request: unknown) => {
    const wc = getWebContents();
    if (wc) {
      wc.send('claude:permission-request', pid, request);
    }
  });

  handle('claude:spawn', async (_event, cwd: string, sessionId?: string, permissionMode?: string, envVars?: Array<{ key: string; value: string; enabled: boolean }>, language?: string, mcpServers?: Array<{ id: string; name: string; command: string; args: string[]; env: Record<string, string>; enabled: boolean }>, includeCoAuthoredBy?: boolean) => {
    // Log enabled MCP servers (don't write to file - pass directly to CLI for security)
    if (mcpServers && mcpServers.length > 0) {
      const enabledServers = mcpServers.filter(s => s.enabled);
      console.log('[mcp-manager] Enabled MCP servers:', enabledServers.map(s => s.name).join(', ') || 'none');
    }
    return claudeProcessManager.spawn(cwd, sessionId, permissionMode, envVars, language, mcpServers, includeCoAuthoredBy);
  });

  handle('claude:send', (_event, processId: string, content: string) => {
    return claudeProcessManager.sendMessage(processId, content);
  });

  handle('claude:kill', (_event, processId: string) => {
    return claudeProcessManager.kill(processId);
  });

  // MCP servers info
  handle('mcp:getRunningServers', () => {
    return mcpManager.getRunningServers();
  });

  // Prevent system sleep
  let sleepBlockerId: number | null = null;
  handle('app:preventSleep', (_event, prevent: boolean) => {
    if (prevent) {
      if (sleepBlockerId === null) {
        sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        console.log('[app] Prevented system sleep, blocker ID:', sleepBlockerId);
      }
    } else {
      if (sleepBlockerId !== null) {
        powerSaveBlocker.stop(sleepBlockerId);
        console.log('[app] Allowed system sleep, blocker ID:', sleepBlockerId);
        sleepBlockerId = null;
      }
    }
    return sleepBlockerId;
  });

  // Permission response from renderer → forward to CLI permission resolver
  handle('claude:permission-response', (_event, processId: string, requestId: string, response: { behavior: 'allow' | 'deny'; updatedInput?: Record<string, unknown>; message?: string }) => {
    return claudeProcessManager.respondToPermission(processId, requestId, response);
  });

  // Runtime permission mode change
  handle('claude:setPermissionMode', async (_event, processId: string, mode: string) => {
    return claudeProcessManager.setPermissionMode(processId, mode);
  });

  // ─── Sessions ─────────────────────────────────────────────────────
  handle('sessions:list', () => {
    return sessionManager.getAllSessions();
  });

  handle(
    'sessions:getMessages',
    (_event, projectPath: string, sessionId: string) => {
      return sessionManager.getSessionMessages(projectPath, sessionId);
    }
  );

  handle('sessions:listProjects', () => {
    return sessionManager.listAllProjects();
  });

  handle(
    'sessions:fork',
    (_event, projectPath: string, sessionId: string, cutoffUuid: string) => {
      return sessionManager.forkSession(projectPath, sessionId, cutoffUuid);
    }
  );

  handle(
    'sessions:archive',
    (_event, projectPath: string, sessionId: string) => {
      return sessionManager.archiveSession(projectPath, sessionId);
    }
  );

  handle(
    'sessions:unarchive',
    (_event, archivedSessionId: string) => {
      return sessionManager.unarchiveSession(archivedSessionId);
    }
  );

  handle('sessions:listArchived', () => {
    return sessionManager.listArchivedSessions();
  });

  // ─── Git ──────────────────────────────────────────────────────────
  handle('git:status', (_event, cwd: string) => {
    return gitManager.getStatus(cwd);
  });

  handle(
    'git:diff',
    (_event, cwd: string, file?: string, staged?: boolean) => {
      return gitManager.getDiff(cwd, file, staged);
    }
  );

  handle('git:stage', (_event, cwd: string, file: string) => {
    return gitManager.stageFile(cwd, file);
  });

  handle('git:unstage', (_event, cwd: string, file: string) => {
    return gitManager.unstageFile(cwd, file);
  });

  handle('git:discard', (_event, cwd: string, file: string) => {
    return gitManager.discardFile(cwd, file);
  });

  handle('git:discardAll', (_event, cwd: string) => {
    return gitManager.discardAll(cwd);
  });

  handle('git:commit', (_event, cwd: string, message: string) => {
    return gitManager.commit(cwd, message);
  });

  handle('git:branch', (_event, cwd: string) => {
    return gitManager.getCurrentBranch(cwd);
  });

  handle('git:listBranches', (_event, cwd: string) => {
    return gitManager.listBranches(cwd);
  });

  handle('git:checkout', (_event, cwd: string, branch: string) => {
    return gitManager.checkout(cwd, branch);
  });

  handle('git:createBranch', (_event, cwd: string, branch: string) => {
    return gitManager.createAndCheckout(cwd, branch);
  });

  handle('git:log', (_event, cwd: string, maxCount?: number) => {
    return gitManager.log(cwd, maxCount);
  });

  handle('git:showCommitFiles', (_event, cwd: string, hash: string) => {
    return gitManager.showCommitFiles(cwd, hash);
  });

  handle('git:showCommitFileDiff', (_event, cwd: string, hash: string, file: string) => {
    return gitManager.showCommitFileDiff(cwd, hash, file);
  });

  handle('git:searchFiles', (_event, cwd: string, query: string) => {
    return fileManager.searchFiles(cwd, query);
  });

  handle('git:listFiles', async (_event, cwd: string) => {
    return fileManager.listFiles(cwd);
  });

  // ─── Terminal ─────────────────────────────────────────────────────
  handle('terminal:create', (_event, cwd: string) => {
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

  handle('terminal:write', (_event, id: string, data: string) => {
    return terminalManager.write(id, data);
  });

  handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    return terminalManager.resize(id, cols, rows);
  });

  handle('terminal:kill', (_event, id: string) => {
    return terminalManager.kill(id);
  });

  // ─── File ─────────────────────────────────────────────────────────
  handle('file:read', (_event, filePath: string, maxSize?: number) => {
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
  handle('app:getProjectPath', () => {
    return os.homedir();
  });

  handle('app:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  handle('app:getPlatform', () => {
    return getPlatform();
  });

  handle('app:getSystemLocale', () => {
    const { app } = require('electron');
    return app.getLocale();
  });

  handle('app:getHomePath', () => {
    return os.homedir();
  });

  handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  handle('app:getUpdateState', () => {
    return {
      currentVersion: updateState.currentVersion,
      latestVersion: updateState.latestVersion,
      isUpdateAvailable: updateState.isUpdateAvailable,
      isDownloaded: updateState.isDownloaded,
      autoDownloaded: updateState.autoDownloaded,
    };
  });


  handle('app:getClaudeCodeVersion', () => {
    // Only detect the real Claude Code CLI binary
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
    return 'not found';
  });

  handle('app:getGitVersion', () => {
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

  handle('app:installClaudeCode', async () => {
    const wc = getWebContents();
    try {
      // Check if npm is available before attempting install
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      try {
        execSync(`${whichCmd} ${npmCmd}`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        const hint = process.platform === 'win32'
          ? 'Please install Node.js from https://nodejs.org and restart the app.'
          : process.platform === 'darwin'
            ? 'Please install Node.js first: brew install node (or download from https://nodejs.org), then restart the app.'
            : 'Please install Node.js first: sudo apt install nodejs npm (or download from https://nodejs.org), then restart the app.';
        return { success: false, error: `npm is not installed. ${hint}` };
      }

      await new Promise<void>((resolve, reject) => {
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

  handle('app:installGit', async () => {
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

  handle('app:getNodeVersion', () => {
    try {
      const raw = execSync('node --version', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      // Output is like "v22.14.0" — strip the leading "v"
      return raw.startsWith('v') ? raw.slice(1) : raw;
    } catch {
      return 'not found';
    }
  });

  handle('app:installNode', async () => {
    const platform = getPlatform();
    const wc = getWebContents();
    try {
      if (platform === 'mac') {
        // macOS: try Homebrew first
        try {
          execSync('which brew', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
          await new Promise<void>((resolve, reject) => {
            const child = execFile('brew', ['install', 'node@22'], { timeout: 300000 }, (err) => {
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
          return { success: true, message: 'Node.js 22 LTS installed via Homebrew' };
        } catch {
          // Homebrew not available or install failed — open download page
          await shell.openExternal('https://nodejs.org/en/download');
          return { success: true, message: 'Download page opened. Please install Node.js 22 LTS.' };
        }
      } else if (platform === 'windows') {
        await shell.openExternal('https://nodejs.org/en/download');
        return { success: true, message: 'Download page opened. Please install Node.js 22 LTS.' };
      } else {
        // Linux: try common package managers with NodeSource setup for v22
        const commands = [
          { check: 'apt', cmd: 'sudo', args: ['apt', 'install', '-y', 'nodejs'] },
          { check: 'dnf', cmd: 'sudo', args: ['dnf', 'install', '-y', 'nodejs'] },
          { check: 'pacman', cmd: 'sudo', args: ['pacman', '-S', '--noconfirm', 'nodejs', 'npm'] },
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
        await shell.openExternal('https://nodejs.org/en/download');
        return { success: true, message: 'Download page opened. Please install Node.js 22 LTS manually.' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Use electron-updater for auto-update functionality
  // Events are already forwarded to renderer via autoUpdater.on() listeners above

  // Helper: fetch JSON from URL
  function fetchJson<T>(url: string, useGithubAuth: boolean = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const headers: Record<string, string> = {};
      if (useGithubAuth && GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
      }
      const options: any = { timeout: 10000, headers };
      const request = mod.get(url, options, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', reject);
    });
  }

  // Store current release info for download
  let currentReleaseInfo: { version: string; tagName: string } | null = null;

  handle('app:checkForUpdates', async () => {
    // Try to fetch from CDN first (no GitHub API rate limit issues)
    if (CDN_BASE_URL) {
      try {
        const cdnData = await fetchJson<{
          version: string;
          cdnBase: string;
          files: Record<string, string>;
        }>(`${CDN_BASE_URL}/claude-studio/releases/latest/release-info.json`);

        if (cdnData.version) {
          const tagName = `v${cdnData.version}`;
          currentReleaseInfo = { version: cdnData.version, tagName };

          console.log('app', `Found update from CDN: ${cdnData.version}`);

          return {
            version: cdnData.version,
            tagName,
            name: `ClaudeStudio ${cdnData.version}`,
            body: '',
            htmlUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${tagName}`,
            assets: Object.entries(cdnData.files || {}).map(([name, cdnUrl]) => ({
              name,
              size: 0,
              downloadUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${name}`,
              cdnUrl,
            })),
          };
        }
      } catch (err: any) {
        console.log('app', `CDN check failed: ${err?.message}`);
      }
    }

    // CDN not available, fallback to GitHub API (may hit rate limit without token)
    console.log('app', 'CDN unavailable, falling back to GitHub API');

    // Fallback to GitHub API (with or without token)
    try {
      const release: any = await fetchJson(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, true);
      const tagName = release.tag_name || '';
      const version = tagName.replace(/^v/, '');

      // Try to fetch CDN URLs from OSS
      let cdnUrls: Record<string, string> = {};
      if (CDN_BASE_URL) {
        try {
          const cdnData = await fetchJson<{ files: Record<string, string> }>(`${CDN_BASE_URL}/claude-studio/releases/${tagName}/release-info.json`);
          cdnUrls = cdnData.files || {};
        } catch {
          // CDN not available, will use GitHub URLs only
          console.log('app', 'CDN URLs not found, using GitHub URLs only');
        }
      }

      currentReleaseInfo = { version, tagName };

      return {
        version,
        tagName,
        name: release.name || '',
        body: release.body || '',
        htmlUrl: release.html_url || '',
        assets: (release.assets || []).map((a: any) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
          cdnUrl: cdnUrls[a.name] || null,
        })),
      };
    } catch (err: any) {
      console.log('app', `Failed to check for updates: ${err?.message}`);
      // Return null to indicate update check is unavailable rather than crashing
      return null;
    }
  });

  handle('app:downloadUpdate', async (_event, platform: string) => {
    if (!currentReleaseInfo) {
      throw new Error('No update available. Please check for updates first.');
    }

    // Try to get download info from CDN first
    let cdnUrls: Record<string, string> = {};
    let tagName = currentReleaseInfo.tagName;

    if (CDN_BASE_URL) {
      try {
        const cdnData = await fetchJson<{
          version: string;
          cdnBase: string;
          files: Record<string, string>;
        }>(`${CDN_BASE_URL}/claude-studio/releases/latest/release-info.json`);
        cdnUrls = cdnData.files || {};
        tagName = `v${cdnData.version}`;
      } catch {
        // CDN not available, will try GitHub API
        console.log('app', 'CDN download info not available, falling back to GitHub API');
      }
    }

    // Find the correct asset for this platform from CDN
    let assetName: string | null = null;
    const platformPatterns: Record<string, string[]> = {
      mac: ['.dmg', 'darwin', 'mac'],
      windows: ['setup', '.exe', '.msi'],
      linux: ['.deb', '.AppImage', '.rpm'],
    };
    const patterns = platformPatterns[platform] || [];

    // Try to find asset from CDN files first
    if (Object.keys(cdnUrls).length > 0) {
      for (const pattern of patterns) {
        assetName = Object.keys(cdnUrls).find(name => name.includes(pattern)) || null;
        if (assetName) break;
      }
    }

    // Fallback to GitHub API if not found in CDN
    if (!assetName) {
      try {
        const release: any = await fetchJson(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, true);
        tagName = release.tag_name || '';

        // Also fetch CDN URLs for this tag
        if (CDN_BASE_URL) {
          try {
            const cdnData = await fetchJson<{ files: Record<string, string> }>(`${CDN_BASE_URL}/claude-studio/releases/${tagName}/release-info.json`);
            cdnUrls = { ...cdnUrls, ...(cdnData.files || {}) };
          } catch {
            // CDN not available
          }
        }

        for (const pattern of patterns) {
          if (platform === 'mac') {
            assetName = release.assets?.find((a: any) => a.name.endsWith(pattern))?.name
              || release.assets?.find((a: any) => a.name.includes(pattern))?.name
              || null;
          } else if (platform === 'windows') {
            if (pattern === 'setup') {
              assetName = release.assets?.find((a: any) => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe'))?.name || null;
            } else {
              assetName = release.assets?.find((a: any) => a.name.endsWith(pattern))?.name || null;
            }
          } else {
            assetName = release.assets?.find((a: any) => a.name.endsWith(pattern))?.name || null;
          }
          if (assetName) break;
        }
      } catch (err: any) {
        console.log('app', `Failed to fetch release info: ${err?.message}`, err, 'error');
        throw new Error(`Failed to download update: ${err?.message}`);
      }
    }

    if (!assetName) {
      throw new Error(`No suitable asset found for platform: ${platform}`);
    }

    // Get URLs - try CDN first, then GitHub
    const cdnUrl = cdnUrls[assetName];
    const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${assetName}`;

    // Try CDN first, then fall back to GitHub
    const downloadUrl = cdnUrl || githubUrl;
    const useCdn = !!cdnUrl;

    try {
      console.log('app', `Downloading update: ${assetName} from ${useCdn ? 'CDN' : 'GitHub'}`);

      // Send initial progress
      const wc = getWebContents();
      if (wc) wc.send('app:update-status', { state: 'downloading', progress: 0, downloaded: 0, totalSize: 0 });

      // Download the file
      const downloadDir = path.join(app.getPath('temp'), 'claude-studio-updater');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      const downloadPath = path.join(downloadDir, assetName);

      await new Promise<void>((resolve, reject) => {
        const mod = downloadUrl.startsWith('https') ? https : http;
        const request = mod.get(downloadUrl, { timeout: 30000 }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Handle redirect
            const redirectUrl = res.headers.location;
            const redirectMod = redirectUrl.startsWith('https') ? https : http;
            redirectMod.get(redirectUrl, { timeout: 30000 }, (redirectRes: any) => {
              const totalSize = parseInt(res.headers['content-length'] || '0', 10);
              let downloaded = 0;
              const file = fs.createWriteStream(downloadPath);
              redirectRes.on('data', (chunk: Buffer) => {
                downloaded += chunk.length;
                if (wc && totalSize > 0) {
                  wc.send('app:update-status', {
                    state: 'downloading',
                    progress: (downloaded / totalSize) * 100,
                    downloaded,
                    totalSize,
                  });
                }
              });
              redirectRes.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            }).on('error', reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalSize = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const file = fs.createWriteStream(downloadPath);

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (wc && totalSize > 0) {
              wc.send('app:update-status', {
                state: 'downloading',
                progress: (downloaded / totalSize) * 100,
                downloaded,
                totalSize,
              });
            }
          });

          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      });

      // Notify that download is complete
      if (wc) {
        wc.send('app:update-status', { state: 'downloaded', release: { version: currentReleaseInfo.version, tagName: currentReleaseInfo.tagName } });
      }

      console.log('app', `Update downloaded to: ${downloadPath}`);

      // Store the download path for install
      (global as any).pendingUpdatePath = downloadPath;

    } catch (err: any) {
      console.log('app', `Failed to download update: ${err?.message}`, err, 'error');
      throw new Error(`Failed to download update: ${err?.message}`);
    }
  });

  handle('app:installUpdate', async () => {
    const sendInstalling = (step: string) => {
      const wc = getWebContents();
      if (wc) wc.send('app:update-status', { state: 'installing', message: step });
    };

    // If electron-updater has downloaded an update, use it
    if (updateState.isDownloaded) {
      console.log('[app] Installing auto-downloaded update via electron-updater');
      sendInstalling('Installing update…');
      // Small delay so the renderer can show the spinner before quit
      await new Promise(r => setTimeout(r, 100));
      autoUpdater.quitAndInstall(false, true);
      return true;
    }
    // Fallback to manual download path
    const pendingPath = (global as any).pendingUpdatePath;
    if (pendingPath && fs.existsSync(pendingPath)) {
      console.log('[app] Installing update from:', pendingPath);

      // macOS .dmg handling — async to avoid blocking the main process
      if (pendingPath.endsWith('.dmg')) {
        try {
          sendInstalling('Mounting disk image…');
          const { stdout: mountResult } = await execFileAsync('hdiutil', ['attach', pendingPath, '-nobrowse']);
          const mountMatch = mountResult.match(/(\/Volumes\/[^\n]+)/);

          if (mountMatch) {
            const mountPath = mountMatch[1].trim();
            const apps = fs.readdirSync(mountPath).filter((f: string) => f.endsWith('.app'));

            if (apps.length > 0) {
              const appName = apps[0];
              const sourceApp = path.join(mountPath, appName);
              const targetApp = '/Applications/ClaudeStudio.app';

              console.log('[app] Installing', appName, 'to', targetApp);

              sendInstalling('Copying app to Applications…');
              // Remove old app and copy new one
              if (fs.existsSync(targetApp)) {
                await execFileAsync('rm', ['-rf', targetApp]);
              }
              await execFileAsync('cp', ['-R', sourceApp, targetApp]);

              sendInstalling('Cleaning up…');
              // Unmount DMG (best effort)
              try { await execFileAsync('hdiutil', ['detach', mountPath, '-quiet']); } catch { /* ignore */ }

              sendInstalling('Restarting…');
              // Schedule relaunch AFTER quit using a detached shell process
              const child = spawn('sh', ['-c', `sleep 1 && open "${targetApp}"`], {
                detached: true,
                stdio: 'ignore',
              });
              child.unref();

              app.quit();
              return true;
            }
          }
        } catch (err) {
          console.error('[app] DMG install failed:', err);
          shell.openPath(pendingPath);
          app.quit();
          return true;
        }
      }

      // Windows .exe handling — run NSIS installer silently then relaunch
      if (pendingPath.endsWith('.exe')) {
        try {
          sendInstalling('Running installer…');
          // NSIS installers support /S for silent install and /D for install dir
          const child = spawn('cmd.exe', ['/c', `"${pendingPath}" /S && timeout /t 2 /nobreak >nul && start "" "${process.execPath}"`], {
            detached: true,
            stdio: 'ignore',
            shell: true,
          });
          child.unref();
          app.quit();
          return true;
        } catch (err) {
          console.error('[app] EXE install failed:', err);
          shell.openPath(pendingPath);
          app.quit();
          return true;
        }
      }

      // Other platforms — open the installer
      sendInstalling('Opening installer…');
      shell.openPath(pendingPath);
      app.quit();
      return true;
    }
    throw new Error('No update available to install');
  });

  handle('app:getModel', () => {
    return getClaudeModel();
  });

  handle('app:checkDependencies', () => {
    return checkDependencies();
  });

  handle('app:openInEditor', async (_event, cwd: string, editor: string) => {
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

  handle('app:getAvailableEditors', async () => {
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
  handle('app:checkRuntimeDeps', async () => {
    // In packaged app, deps are bundled by forge hook — always report found
    if (app.isPackaged) {
      return [
        { name: 'node-pty', found: true },
      ];
    }

    // Dev mode: actually check
    const results: { name: string; found: boolean; error?: string }[] = [];

    try {
      require('node-pty');
      results.push({ name: 'node-pty', found: true });
    } catch {
      results.push({ name: 'node-pty', found: false });
    }

    return results;
  });

  handle('app:installRuntimeDeps', async () => {
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

    const depsToInstall = ['node-pty'];
    const missing: string[] = [];

    // Check which deps are actually missing
    for (const dep of depsToInstall) {
      try {
        require(dep);
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
  handle('claudeConfig:read', () => {
    return readClaudeConfig();
  });

  handle('claudeConfig:write', (_event, updates: Record<string, unknown>) => {
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

  handle('settings:read', async () => {
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

  handle('settings:write', async (_event, data: Record<string, unknown>) => {
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
  handle('git:push', async (_event, cwd: string) => {
    return gitManager.push(cwd);
  });

  handle('git:pushTags', async (_event, cwd: string) => {
    return gitManager.pushTags(cwd);
  });

  // ─── File operations ─────────────────────────────────────────────
  handle('app:showItemInFolder', (_event, fullPath: string) => {
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

  handle('app:openFile', async (_event, fullPath: string) => {
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

  handle('app:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  // ─── Skills (~/.claude/skills/) ─────────────────────────────────────
  const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');

  handle('skills:list', async () => {
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

  handle('skills:read', async (_event, filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8');
  });

  handle('skills:create', async (_event, name: string, content: string) => {
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

  handle('skills:update', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('skills:update failed:', err?.message);
      return false;
    }
  });

  handle('skills:remove', async (_event, dirPath: string) => {
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

  handle('commands:list', async () => {
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

  handle('commands:read', async (_event, filePath: string) => {
    return fs.readFileSync(filePath, 'utf-8');
  });

  handle('commands:create', async (_event, fileName: string, content: string) => {
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

  handle('commands:update', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err: any) {
      console.error('commands:update failed:', err?.message);
      return false;
    }
  });

  handle('commands:remove', async (_event, filePath: string) => {
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

  // ─── Remote Control ─────────────────────────────────────────────
  registerRemoteIpcHandlers();

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
