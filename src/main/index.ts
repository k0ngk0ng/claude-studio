import { app, BrowserWindow, ipcMain, globalShortcut, Menu } from 'electron';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { registerIpcHandlers } from './ipc-handlers';

// Debug log — console only (no file writes)
function mainDebugLog(...args: unknown[]) {
  console.log('[main]', ...args);
}

mainDebugLog('App starting, isPackaged:', app.isPackaged, 'appPath:', app.getAppPath());

// Suppress macOS IMK/NSLog noise (e.g. IMKCFRunLoopWakeUpReliable)
if (process.platform === 'darwin') {
  process.env.OS_ACTIVITY_MODE = 'disable';
}

/**
 * Fix PATH for packaged Electron apps.
 *
 * When launched from Dock/Finder/Start Menu, Electron inherits a minimal PATH
 * that doesn't include user-installed tools (node, git, claude, etc.).
 * We fix this by:
 * 1. Sourcing the user's shell to get the full PATH (macOS/Linux)
 * 2. Adding common tool locations as fallback
 */
function fixPath() {
  const homeDir = os.homedir();

  if (process.platform === 'win32') {
    // Windows: add common Node.js locations
    const extraPaths = [
      path.join(homeDir, 'AppData', 'Roaming', 'npm'),
      path.join(homeDir, '.local', 'bin'),
      'C:\\Program Files\\nodejs',
      'C:\\Program Files (x86)\\nodejs',
    ];
    const currentPath = process.env.PATH || '';
    for (const p of extraPaths) {
      if (!currentPath.includes(p)) {
        process.env.PATH = `${currentPath};${p}`;
      }
    }
  } else {
    // macOS / Linux: get the full PATH from user's login shell
    try {
      const shell = process.env.SHELL || '/bin/zsh';
      const fullPath = execSync(`${shell} -ilc 'echo $PATH'`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (fullPath) {
        process.env.PATH = fullPath;
      }
    } catch {
      // Fallback: add common paths manually
      const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        path.join(homeDir, '.local', 'bin'),
        path.join(homeDir, '.nvm', 'versions', 'node'),  // nvm
        '/usr/local/opt/node/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ];
      const currentPath = process.env.PATH || '';
      const pathSet = new Set(currentPath.split(':'));
      for (const p of extraPaths) {
        if (!pathSet.has(p)) {
          pathSet.add(p);
        }
      }
      process.env.PATH = Array.from(pathSet).join(':');
    }
  }
}

// Fix PATH before anything else
fixPath();
mainDebugLog('PATH fixed:', process.env.PATH?.split(':').slice(0, 8).join(':'));

// Check if node is findable
try {
  const nodePath = execSync('which node', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  mainDebugLog('node found at:', nodePath);
} catch {
  mainDebugLog('WARNING: node not found in PATH');
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const isMac = process.platform === 'darwin';

  // Resolve icon path — works in both dev and production
  // In dev: assets/ is in project root (process.cwd())
  // In production: extraResource copies assets/ to <app>/Contents/Resources/assets/ (macOS)
  //                or <app>/resources/assets/ (Windows/Linux)
  const iconPath = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(process.cwd(), 'assets', 'icon.png')
    : path.join(process.resourcesPath, 'assets', 'icon.png');

  // Hide menu bar on Windows/Linux (macOS uses hiddenInset titlebar)
  if (!isMac) {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    frame: !isMac,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open DevTools in development
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  // DevTools toggle — controlled by renderer based on debug mode setting
  ipcMain.handle('app:toggleDevTools', () => {
    mainWindow?.webContents.toggleDevTools();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
