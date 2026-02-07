import { ipcMain, dialog, BrowserWindow } from 'electron';
import { claudeProcessManager } from './claude-process';
import { sessionManager } from './session-manager';
import { gitManager } from './git-manager';
import { terminalManager } from './terminal-manager';
import { getPlatform, getClaudeModel } from './platform';
import os from 'os';

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0].webContents : null;
}

export function registerIpcHandlers(): void {
  // ─── Claude Process ───────────────────────────────────────────────
  ipcMain.handle('claude:spawn', (_event, cwd: string, sessionId?: string) => {
    const processId = claudeProcessManager.spawn(cwd, sessionId);

    claudeProcessManager.on('message', (pid: string, message: unknown) => {
      if (pid === processId) {
        const wc = getWebContents();
        if (wc) {
          wc.send('claude:message', processId, message);
        }
      }
    });

    claudeProcessManager.on('exit', (pid: string, code: number, signal: string) => {
      if (pid === processId) {
        const wc = getWebContents();
        if (wc) {
          wc.send('claude:message', processId, {
            type: 'exit',
            code,
            signal,
          });
        }
      }
    });

    claudeProcessManager.on('error', (pid: string, errorMsg: string) => {
      if (pid === processId) {
        const wc = getWebContents();
        if (wc) {
          wc.send('claude:message', processId, {
            type: 'error',
            message: { role: 'system', content: errorMsg },
          });
        }
      }
    });

    return processId;
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
