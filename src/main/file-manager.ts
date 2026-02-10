import fs from 'fs';
import path from 'path';

/**
 * Cross-platform file manager using Node.js fs APIs.
 * No dependency on git — works for any directory.
 */

// Directories to always skip
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.vercel',
  '.netlify',
  'coverage',
  '.nyc_output',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'venv',
  '.venv',
  'env',
  '.env',
  'vendor',
  'Pods',
  '.gradle',
  '.idea',
  '.vscode',
  '.DS_Store',
  'target',        // Rust/Java
  'zig-cache',
  'zig-out',
  '.dart_tool',
  '.pub-cache',
  '.terraform',
]);

// Binary / large file extensions to skip
const IGNORED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.a', '.o', '.obj',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flac', '.wav',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pyc', '.pyo', '.class',
  '.lock',
]);

const MAX_DEPTH = 10;
const MAX_FILES = 50000;

class FileManager {
  /**
   * List all files in a directory recursively.
   * Returns relative paths sorted alphabetically.
   */
  async listFiles(cwd: string): Promise<string[]> {
    const files: string[] = [];
    await this.walkDir(cwd, cwd, 0, files);
    files.sort();
    return files;
  }

  /**
   * Search files by query (fuzzy match on path, case-insensitive).
   */
  async searchFiles(cwd: string, query: string, limit = 30): Promise<{ name: string; path: string }[]> {
    const allFiles = await this.listFiles(cwd);

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
  }

  private async walkDir(
    basePath: string,
    currentPath: string,
    depth: number,
    files: string[],
  ): Promise<void> {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      // Permission denied or other error — skip
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const name = entry.name;

      // Skip hidden files/dirs (except a few common ones)
      if (name.startsWith('.') && !name.startsWith('.env') && !name.startsWith('.git') && name !== '.github' && name !== '.vscode' && name !== '.editorconfig' && name !== '.eslintrc' && name !== '.prettierrc') {
        // Allow .gitignore, .eslintrc.js, etc. (files, not dirs)
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(name)) continue;
          // Skip other hidden dirs
          continue;
        }
      }

      const fullPath = path.join(currentPath, name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        await this.walkDir(basePath, fullPath, depth + 1, files);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const ext = path.extname(name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) continue;

        // Convert to relative path with forward slashes
        const relativePath = path.relative(basePath, fullPath).split(path.sep).join('/');
        files.push(relativePath);
      }
    }
  }
}

export const fileManager = new FileManager();
