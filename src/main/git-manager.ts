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
