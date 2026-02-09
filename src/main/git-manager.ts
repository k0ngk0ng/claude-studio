import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface FileChange {
  path: string;
  status: string;
  statusLabel: string;
  additions: number;
  deletions: number;
}

export interface GitStatus {
  branch: string;
  unstaged: FileChange[];
  staged: FileChange[];
}

const STATUS_MAP: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Unmerged',
  '?': 'Untracked',
  '!': 'Ignored',
};

function parseStatusCode(code: string): string {
  return STATUS_MAP[code] || 'Unknown';
}

class GitManager {
  private async exec(
    args: string[],
    cwd: string
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      return result;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      if (error.stdout !== undefined) {
        return { stdout: error.stdout || '', stderr: error.stderr || '' };
      }
      throw new Error(error.message || 'Git command failed');
    }
  }

  async getStatus(cwd: string): Promise<GitStatus> {
    const [statusResult, branchResult] = await Promise.all([
      this.exec(['status', '--porcelain=v1'], cwd),
      this.getCurrentBranch(cwd),
    ]);

    const unstaged: FileChange[] = [];
    const staged: FileChange[] = [];
    const lines = statusResult.stdout.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.slice(3).trim();

      // Handle renames: "R  old -> new"
      const displayPath = filePath.includes(' -> ')
        ? filePath.split(' -> ')[1]
        : filePath;

      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({
          path: displayPath,
          status: indexStatus,
          statusLabel: parseStatusCode(indexStatus),
          additions: 0,
          deletions: 0,
        });
      }

      if (workTreeStatus !== ' ' && workTreeStatus !== undefined) {
        const status = indexStatus === '?' ? '?' : workTreeStatus;
        unstaged.push({
          path: displayPath,
          status,
          statusLabel: parseStatusCode(status),
          additions: 0,
          deletions: 0,
        });
      }
    }

    return {
      branch: branchResult,
      unstaged,
      staged,
    };
  }

  async getDiff(cwd: string, file?: string, staged?: boolean): Promise<string> {
    const args = ['diff'];
    if (staged) args.push('--cached');
    args.push('--no-color');
    if (file) args.push('--', file);

    const result = await this.exec(args, cwd);
    return result.stdout;
  }

  async getUncommittedFiles(cwd: string): Promise<string[]> {
    const result = await this.exec(['diff', '--name-only'], cwd);
    return result.stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.trim());
  }

  async stageFile(cwd: string, file: string): Promise<void> {
    await this.exec(['add', '--', file], cwd);
  }

  async unstageFile(cwd: string, file: string): Promise<void> {
    await this.exec(['reset', 'HEAD', '--', file], cwd);
  }

  async commit(cwd: string, message: string): Promise<string> {
    const result = await this.exec(['commit', '-m', message], cwd);
    return result.stdout;
  }

  async getCurrentBranch(cwd: string): Promise<string> {
    try {
      const result = await this.exec(['branch', '--show-current'], cwd);
      return result.stdout.trim() || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  async getDiffStats(cwd: string): Promise<string> {
    const result = await this.exec(['diff', '--stat'], cwd);
    return result.stdout;
  }

  async listBranches(cwd: string): Promise<{ name: string; current: boolean }[]> {
    try {
      const result = await this.exec(['branch', '-a', '--no-color'], cwd);
      const branches: { name: string; current: boolean }[] = [];
      const seen = new Set<string>();

      for (const line of result.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const isCurrent = line.startsWith('*');
        let name = trimmed.replace(/^\*\s*/, '');

        // Skip HEAD pointers like "remotes/origin/HEAD -> origin/main"
        if (name.includes('->')) continue;

        // Strip "remotes/origin/" prefix for remote branches
        if (name.startsWith('remotes/origin/')) {
          name = name.replace('remotes/origin/', '');
        }

        // Deduplicate (local and remote may have same name)
        if (seen.has(name)) {
          // If this is the current one, update it
          if (isCurrent) {
            const existing = branches.find((b) => b.name === name);
            if (existing) existing.current = true;
          }
          continue;
        }

        seen.add(name);
        branches.push({ name, current: isCurrent });
      }

      // Sort: current first, then alphabetical
      branches.sort((a, b) => {
        if (a.current && !b.current) return -1;
        if (!a.current && b.current) return 1;
        return a.name.localeCompare(b.name);
      });

      return branches;
    } catch {
      return [];
    }
  }

  async checkout(cwd: string, branch: string): Promise<string> {
    const result = await this.exec(['checkout', branch], cwd);
    return result.stderr || result.stdout; // git checkout outputs to stderr
  }

  async createAndCheckout(cwd: string, branch: string): Promise<string> {
    const result = await this.exec(['checkout', '-b', branch], cwd);
    return result.stderr || result.stdout;
  }

  async push(cwd: string): Promise<string> {
    const result = await this.exec(['push'], cwd);
    return result.stderr || result.stdout;
  }

  async pushTags(cwd: string): Promise<string> {
    const result = await this.exec(['push', '--tags'], cwd);
    return result.stderr || result.stdout;
  }

  async isGitRepo(cwd: string): Promise<boolean> {
    try {
      await this.exec(['rev-parse', '--is-inside-work-tree'], cwd);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all files in the project (for file tree). Returns all relative paths.
   */
  async listFiles(cwd: string): Promise<string[]> {
    try {
      let stdout: string;
      const isGit = await this.isGitRepo(cwd);

      if (isGit) {
        const result = await this.exec(['ls-files', '--cached', '--others', '--exclude-standard'], cwd);
        stdout = result.stdout;
      } else {
        const result = await execFileAsync('find', [
          cwd, '-type', 'f',
          '-not', '-path', '*/node_modules/*',
          '-not', '-path', '*/.git/*',
          '-not', '-path', '*/dist/*',
          '-not', '-path', '*/.next/*',
          '-not', '-path', '*/__pycache__/*',
          '-maxdepth', '8',
        ], { cwd, maxBuffer: 10 * 1024 * 1024 });
        stdout = result.stdout.split('\n')
          .map((p) => p.replace(cwd + '/', '').replace(cwd + '\\', ''))
          .join('\n');
      }

      return stdout.split('\n').filter((f) => f.trim()).sort();
    } catch {
      return [];
    }
  }

  /**
   * Search files in the project. Uses git ls-files if in a git repo,
   * otherwise falls back to a basic find command.
   */
  async searchFiles(cwd: string, query: string, limit = 30): Promise<{ name: string; path: string }[]> {
    try {
      let stdout: string;
      const isGit = await this.isGitRepo(cwd);

      if (isGit) {
        // Use git ls-files for tracked files (fast, respects .gitignore)
        const result = await this.exec(['ls-files', '--cached', '--others', '--exclude-standard'], cwd);
        stdout = result.stdout;
      } else {
        // Fallback: find files (exclude common dirs)
        const result = await execFileAsync('find', [
          cwd, '-type', 'f',
          '-not', '-path', '*/node_modules/*',
          '-not', '-path', '*/.git/*',
          '-not', '-path', '*/dist/*',
          '-not', '-path', '*/.next/*',
          '-not', '-path', '*/__pycache__/*',
          '-maxdepth', '8',
        ], { cwd, maxBuffer: 10 * 1024 * 1024 });
        // Convert absolute paths to relative
        stdout = result.stdout.split('\n')
          .map((p) => p.replace(cwd + '/', '').replace(cwd + '\\', ''))
          .join('\n');
      }

      const allFiles = stdout.split('\n').filter((f) => f.trim());

      // Filter by query (fuzzy: match anywhere in path, case-insensitive)
      const lowerQuery = query.toLowerCase();
      const matched = lowerQuery
        ? allFiles.filter((f) => f.toLowerCase().includes(lowerQuery))
        : allFiles;

      // Sort: prefer filename matches over path matches, shorter paths first
      matched.sort((a, b) => {
        const aName = a.split('/').pop()?.toLowerCase() || '';
        const bName = b.split('/').pop()?.toLowerCase() || '';
        const aNameMatch = aName.includes(lowerQuery) ? 0 : 1;
        const bNameMatch = bName.includes(lowerQuery) ? 0 : 1;
        if (aNameMatch !== bNameMatch) return aNameMatch - bNameMatch;
        return a.length - b.length;
      });

      return matched.slice(0, limit).map((f) => ({
        name: f.split('/').pop() || f,
        path: f,
      }));
    } catch {
      return [];
    }
  }
}

export const gitManager = new GitManager();
