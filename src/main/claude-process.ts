import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getClaudeBinary } from './platform';
import { randomUUID } from 'crypto';

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

interface ManagedProcess {
  process: ChildProcess;
  cwd: string;
  sessionId?: string;
  buffer: string;
}

class ClaudeProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();
  private isWindows = process.platform === 'win32';

  spawn(cwd: string, sessionId?: string): string {
    const processId = randomUUID();
    const claudeBinary = getClaudeBinary();

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    const child = spawn(claudeBinary, args, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      // On Windows, .cmd/.bat files require shell: true to execute
      ...(this.isWindows ? { shell: true } : {}),
    });

    const managed: ManagedProcess = {
      process: child,
      cwd,
      sessionId,
      buffer: '',
    };

    this.processes.set(processId, managed);

    child.stdout?.on('data', (data: Buffer) => {
      managed.buffer += data.toString('utf-8');
      const lines = managed.buffer.split('\n');
      // Keep the last incomplete line in the buffer
      managed.buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed: ClaudeMessage = JSON.parse(trimmed);
          this.emit('message', processId, parsed);
        } catch {
          // Non-JSON output, emit as raw
          this.emit('message', processId, {
            type: 'raw',
            message: { role: 'system', content: trimmed },
          });
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8').trim();
      if (text) {
        this.emit('message', processId, {
          type: 'error',
          message: { role: 'system', content: text },
        });
      }
    });

    child.on('exit', (code, signal) => {
      this.emit('exit', processId, code, signal);
      this.processes.delete(processId);
    });

    child.on('error', (err) => {
      this.emit('error', processId, err.message);
      this.processes.delete(processId);
    });

    return processId;
  }

  sendMessage(processId: string, content: string): boolean {
    const managed = this.processes.get(processId);
    if (!managed || !managed.process.stdin?.writable) {
      return false;
    }

    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    });

    managed.process.stdin.write(message + '\n');
    return true;
  }

  kill(processId: string): boolean {
    const managed = this.processes.get(processId);
    if (!managed) return false;

    if (this.isWindows) {
      // Windows doesn't support POSIX signals; use taskkill for tree kill
      const pid = managed.process.pid;
      if (pid) {
        try {
          spawn('taskkill', ['/pid', pid.toString(), '/T', '/F'], { shell: true });
        } catch {
          // Fallback: just kill the direct process
          managed.process.kill();
        }
      } else {
        managed.process.kill();
      }
    } else {
      managed.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        try {
          managed.process.kill('SIGKILL');
        } catch {
          // Process already dead
        }
      }, 5000);
    }

    this.processes.delete(processId);
    return true;
  }

  killAll(): void {
    for (const [id] of this.processes) {
      this.kill(id);
    }
  }

  isRunning(processId: string): boolean {
    return this.processes.has(processId);
  }

  getProcessInfo(processId: string): { cwd: string; sessionId?: string } | null {
    const managed = this.processes.get(processId);
    if (!managed) return null;
    return { cwd: managed.cwd, sessionId: managed.sessionId };
  }
}

export const claudeProcessManager = new ClaudeProcessManager();
