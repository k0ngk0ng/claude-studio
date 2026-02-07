import { getDefaultShell } from './platform';
import { randomUUID } from 'crypto';

// node-pty is a native module, import dynamically to handle build issues
let pty: typeof import('node-pty') | null = null;
try {
  pty = require('node-pty');
} catch {
  console.warn('node-pty not available — terminal features disabled');
}

type IPty = import('node-pty').IPty;

interface ManagedTerminal {
  pty: IPty;
  cwd: string;
  listeners: Map<string, (data: string) => void>;
}

class TerminalManager {
  private terminals: Map<string, ManagedTerminal> = new Map();

  create(cwd: string, shell?: string): string | null {
    if (!pty) return null;

    const id = randomUUID();
    const shellPath = shell || getDefaultShell();
    const isWindows = process.platform === 'win32';

    const shellArgs = isWindows ? [] : ['-l'];

    const terminal = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
      ...(isWindows ? { useConpty: true } : {}),
    });

    const managed: ManagedTerminal = {
      pty: terminal,
      cwd,
      listeners: new Map(),
    };

    this.terminals.set(id, managed);

    terminal.onExit(() => {
      this.terminals.delete(id);
    });

    return id;
  }

  write(id: string, data: string): boolean {
    const managed = this.terminals.get(id);
    if (!managed) return false;
    managed.pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const managed = this.terminals.get(id);
    if (!managed) return false;
    try {
      managed.pty.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }

  onData(id: string, callback: (data: string) => void): string | null {
    const managed = this.terminals.get(id);
    if (!managed) return null;

    const listenerId = randomUUID();
    managed.listeners.set(listenerId, callback);

    const disposable = managed.pty.onData((data) => {
      callback(data);
    });

    // Store disposable for cleanup
    const originalCallback = managed.listeners.get(listenerId);
    if (originalCallback) {
      managed.listeners.set(listenerId, (data: string) => {
        originalCallback(data);
      });
    }

    return listenerId;
  }

  kill(id: string): boolean {
    const managed = this.terminals.get(id);
    if (!managed) return false;

    managed.pty.kill();
    managed.listeners.clear();
    this.terminals.delete(id);
    return true;
  }

  killAll(): void {
    for (const [id] of this.terminals) {
      this.kill(id);
    }
  }

  isAvailable(): boolean {
    return pty !== null;
  }
}

export const terminalManager = new TerminalManager();
