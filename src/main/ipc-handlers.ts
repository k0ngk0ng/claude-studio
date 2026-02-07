import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { claudeProcessManager } from './claude-process';
import { sessionManager } from './session-manager';
import { gitManager } from './git-manager';
import { terminalManager } from './terminal-manager';
import { getPlatform, getClaudeModel } from './platform';
import os from 'os';
import { execFile } from 'child_process';

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

  ipcMain.handle('claude:spawn', (_event, cwd: string, sessionId?: string) => {
    return claudeProcessManager.spawn(cwd, sessionId);
  });

  ipcMain.handle('claude:send', (_event, processId: string, content: string) => {
    return claudeProcessManager.sendMessage(processId, content);
  });

  ipcMain.handle('claude:kill', (_event, processId: string) => {
    return claudeProcessManager.kill(processId);
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

  ipcMain.handle('app:getModel', () => {
    return getClaudeModel();
  });

  ipcMain.handle('app:openInEditor', async (_event, cwd: string, editor: string) => {
    try {
      switch (editor) {
        case 'finder':
          await shell.openPath(cwd);
          return true;
        case 'terminal': {
          // Open native terminal at directory
          const platform = getPlatform();
          if (platform === 'mac') {
            execFile('open', ['-a', 'Terminal', cwd]);
          } else if (platform === 'windows') {
            execFile('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${cwd}"`], { shell: true });
          } else {
            execFile('xdg-open', [cwd]);
          }
          return true;
        }
        case 'vscode':
          execFile('code', [cwd]);
          return true;
        case 'cursor':
          execFile('cursor', [cwd]);
          return true;
        case 'windsurf':
          execFile('windsurf', [cwd]);
          return true;
        case 'zed':
          execFile('zed', [cwd]);
          return true;
        case 'idea':
          execFile('idea', [cwd]);
          return true;
        case 'webstorm':
          execFile('webstorm', [cwd]);
          return true;
        case 'xcode':
          execFile('open', ['-a', 'Xcode', cwd]);
          return true;
        default:
          // Try to run the editor command directly
          execFile(editor, [cwd]);
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
