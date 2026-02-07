import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

export function getClaudeBinary(): string {
  const homeDir = os.homedir();

  if (isWindows) {
    const localPath = path.join(homeDir, '.local', 'bin', 'claude.cmd');
    try {
      const stat = require('fs').statSync(localPath);
      if (stat.isFile()) return localPath;
    } catch {
      // fall through
    }
    try {
      return execSync('where claude', { encoding: 'utf-8' }).trim().split('\n')[0];
    } catch {
      return 'claude';
    }
  }

  // macOS / Linux
  const localPath = path.join(homeDir, '.local', 'bin', 'claude');
  try {
    const stat = require('fs').statSync(localPath);
    if (stat.isFile()) return localPath;
  } catch {
    // fall through
  }
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

export function getSessionsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function getHomePath(): string {
  return os.homedir();
}

export function encodePath(absolutePath: string): string {
  // Claude CLI encodes project paths by replacing path separators with hyphens
  // and removing the leading separator.
  // On Windows, paths look like "C:\Users\..." — we strip the leading separator
  // and replace colons (from drive letters) as well.
  let normalized = absolutePath;
  // Remove leading slash (Unix) or backslash (Windows UNC)
  if (normalized.startsWith('/') || normalized.startsWith('\\')) {
    normalized = normalized.slice(1);
  }
  // Replace colons (Windows drive letters like "C:"), forward slashes, and backslashes
  return normalized.replace(/[:/\\]/g, '-');
}

export function getDefaultShell(): string {
  if (isWindows) {
    // Prefer PowerShell over cmd.exe; COMSPEC is typically cmd.exe
    return 'powershell.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

export function getPlatform(): 'mac' | 'windows' | 'linux' {
  if (isMac) return 'mac';
  if (isWindows) return 'windows';
  return 'linux';
}
