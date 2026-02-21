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

    // For untracked or newly added files, git diff returns empty.
    // Use --no-index to generate a full-content diff.
    if (!result.stdout.trim() && file) {
      try {
        const noIndexResult = await this.exec(
          ['diff', '--no-index', '--no-color', '--', '/dev/null', file],
          cwd
        );
        return noIndexResult.stdout;
      } catch {
        return result.stdout;
      }
    }

    return result.stdout;
  }

  async getUncommittedFiles(cwd: string): Promise<string[]> {
    const result = await this.exec(['diff', '--name-only'], cwd);
    return result.stdout
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.trim());
  }

  /**
   * List all files respecting .gitignore rules.
   * Combines tracked files + untracked (but not ignored) files.
   */
  async listFiles(cwd: string): Promise<string[]> {
    // Tracked files (including staged new files)
    const tracked = await this.exec(['ls-files', '--cached'], cwd);
    // Untracked files that are not ignored
    const untracked = await this.exec(['ls-files', '--others', '--exclude-standard'], cwd);

    const fileSet = new Set<string>();
    for (const line of tracked.stdout.split('\n')) {
      const f = line.trim();
      if (f) fileSet.add(f);
    }
    for (const line of untracked.stdout.split('\n')) {
      const f = line.trim();
      if (f) fileSet.add(f);
    }

    return Array.from(fileSet).sort();
  }

  async stageFile(cwd: string, file: string): Promise<void> {
    await this.exec(['add', '--', file], cwd);
  }

  async unstageFile(cwd: string, file: string): Promise<void> {
    await this.exec(['reset', 'HEAD', '--', file], cwd);
  }

  async discardFile(cwd: string, file: string): Promise<void> {
    // For tracked files: git checkout -- <file>
    // For untracked files: rm <file>
    const status = await this.getStatus(cwd);
    const isTracked = status.staged.some(f => f.path === file) || status.unstaged.some(f => f.path === file && f.status !== '?');

    if (isTracked) {
      await this.exec(['checkout', '--', file], cwd);
    } else {
      // For untracked files, use git clean or rm
      await this.exec(['rm', '-f', '--', file], cwd);
    }
  }

  async discardAll(cwd: string): Promise<void> {
    // Discard all unstaged changes: git checkout -- .
    // Also remove untracked files: git clean -fd
    await this.exec(['checkout', '--', '.'], cwd);
    await this.exec(['clean', '-fd'], cwd);
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

  async log(cwd: string, maxCount = 100): Promise<{ hash: string; shortHash: string; subject: string; author: string; date: string }[]> {
    const sep = '@@SEP@@';
    const result = await this.exec(
      ['log', `--max-count=${maxCount}`, `--pretty=format:%H${sep}%h${sep}%s${sep}%an${sep}%aI`],
      cwd
    );
    if (!result.stdout.trim()) return [];
    return result.stdout.trim().split('\n').map(line => {
      const [hash, shortHash, subject, author, date] = line.split(sep);
      return { hash, shortHash, subject, author, date };
    });
  }

  async showCommitFiles(cwd: string, hash: string): Promise<{ path: string; status: string }[]> {
    const result = await this.exec(
      ['diff-tree', '--no-commit-id', '-r', '--name-status', hash],
      cwd
    );
    if (!result.stdout.trim()) return [];
    return result.stdout.trim().split('\n').map(line => {
      const [status, ...rest] = line.split('\t');
      return { path: rest.join('\t'), status: status.charAt(0) };
    });
  }

  async showCommitFileDiff(cwd: string, hash: string, file: string): Promise<string> {
    const result = await this.exec(
      ['diff', `${hash}~1`, hash, '--no-color', '--', file],
      cwd
    );
    // For the first commit (no parent), fall back to show
    if (!result.stdout.trim()) {
      try {
        const showResult = await this.exec(
          ['show', '--no-color', '--format=', hash, '--', file],
          cwd
        );
        return showResult.stdout;
      } catch {
        return result.stdout;
      }
    }
    return result.stdout;
  }

  async isGitRepo(cwd: string): Promise<boolean> {
    try {
      await this.exec(['rev-parse', '--is-inside-work-tree'], cwd);
      return true;
    } catch {
      return false;
    }
  }

}

export const gitManager = new GitManager();
