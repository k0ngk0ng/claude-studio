import os from 'os';
import path from 'path';
import fs from 'fs';
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
  // Claude CLI encodes project paths by replacing /, \, :, ., and spaces with hyphens.
  // The leading slash becomes a leading hyphen (e.g. /Users/foo → -Users-foo).
  return absolutePath.replace(/[/\\:.\s]/g, '-');
}

export function getDefaultShell(): string {
  if (isWindows) {
    // Use cmd.exe as default — more universally available than PowerShell
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

export function getPlatform(): 'mac' | 'windows' | 'linux' {
  if (isMac) return 'mac';
  if (isWindows) return 'windows';
  return 'linux';
}

/**
 * Detect the active Claude model.
 * Priority: ANTHROPIC_MODEL env → ~/.claude/settings.json env.ANTHROPIC_MODEL
 *           → CLAUDE_CODE_MODEL env → settings.json env.CLAUDE_CODE_MODEL
 *           → fallback "claude-sonnet-4-20250514"
 */
export function getClaudeModel(): string {
  // 1. Check process env vars directly
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  if (process.env.CLAUDE_CODE_MODEL) return process.env.CLAUDE_CODE_MODEL;
  if (process.env.CLAUDE_MODEL) return process.env.CLAUDE_MODEL;

  // 2. Read from ~/.claude/settings.json
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    if (settings.env?.ANTHROPIC_MODEL) return settings.env.ANTHROPIC_MODEL;
    if (settings.env?.CLAUDE_CODE_MODEL) return settings.env.CLAUDE_CODE_MODEL;
    if (settings.env?.CLAUDE_MODEL) return settings.env.CLAUDE_MODEL;
  } catch {
    // settings.json not found or invalid
  }

  // 3. Fallback
  return 'claude-sonnet-4-20250514';
}

// ─── Claude Code settings.json read/write ────────────────────────────

/**
 * Get the path to ~/.claude/settings.json
 */
export function getClaudeSettingsPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDir, 'settings.json');
}

/**
 * Read the entire ~/.claude/settings.json as a plain object.
 * Returns {} if the file doesn't exist or is invalid.
 */
export function readClaudeConfig(): Record<string, unknown> {
  try {
    const content = fs.readFileSync(getClaudeSettingsPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write a partial update to ~/.claude/settings.json (shallow merge at top level).
 * Creates the file (and parent directory) if it doesn't exist.
 */
export function writeClaudeConfig(updates: Record<string, unknown>): void {
  const settingsPath = getClaudeSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const existing = readClaudeConfig();
  const merged = { ...existing, ...updates };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

export interface DependencyStatus {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  installHint: string;
}

/**
 * Check if required external dependencies are available on the system.
 */
export function checkDependencies(): DependencyStatus[] {
  const deps: DependencyStatus[] = [];

  // Check Claude Code CLI
  try {
    const claudePath = getClaudeBinary();
    const version = execSync(`"${claudePath}" --version`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    deps.push({
      name: 'Claude Code CLI',
      found: true,
      path: claudePath,
      version,
      installHint: 'npm install -g @anthropic-ai/claude-code',
    });
  } catch {
    deps.push({
      name: 'Claude Code CLI',
      found: false,
      installHint: 'npm install -g @anthropic-ai/claude-code',
    });
  }

  // Check Git
  try {
    const gitCmd = isWindows ? 'where git' : 'which git';
    const gitPath = execSync(gitCmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n')[0];
    const gitVersion = execSync('git --version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    deps.push({
      name: 'Git',
      found: true,
      path: gitPath,
      version: gitVersion.replace('git version ', ''),
      installHint: isWindows
        ? 'https://git-scm.com/download/win'
        : isMac
          ? 'xcode-select --install'
          : 'sudo apt install git',
    });
  } catch {
    deps.push({
      name: 'Git',
      found: false,
      installHint: isWindows
        ? 'https://git-scm.com/download/win'
        : isMac
          ? 'xcode-select --install'
          : 'sudo apt install git',
    });
  }

  return deps;
}
