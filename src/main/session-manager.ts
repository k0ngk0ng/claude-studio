import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getSessionsDir, encodePath, getArchivedSessionsDir } from './platform';

const isWindows = process.platform === 'win32';

/**
 * Decode an encoded project directory name back to a real filesystem path.
 * Claude Code encodes: / . : \ → -
 * Strategy: split by -, then greedily rebuild path segments by checking
 * which combinations exist on disk.
 */
function decodePath(encoded: string): string {
  // Remove leading hyphen(s) — represents the leading /
  const stripped = encoded.replace(/^-+/, '');
  const parts = stripped.split('-');

  if (isWindows) {
    // Windows: first part might be drive letter
    if (parts.length >= 2 && parts[0].length === 1 && /^[A-Za-z]$/.test(parts[0])) {
      const drive = parts[0] + ':\\';
      return drive + resolveSegments(parts.slice(1), drive);
    }
    return '\\' + resolveSegments(parts, '\\');
  }

  return '/' + resolveSegments(parts, '/');
}

/**
 * Greedily resolve path segments. For each position, try joining
 * the next N parts with '-' (for segments that originally contained hyphens or dots),
 * and check if the resulting directory exists on disk.
 */
function resolveSegments(parts: string[], basePath: string): string {
  const resolved: string[] = [];
  let i = 0;

  while (i < parts.length) {
    let matched = false;

    // Try longest possible segment first (greedy)
    for (let len = parts.length - i; len > 1; len--) {
      // Try with hyphens (original had hyphens)
      const segHyphen = parts.slice(i, i + len).join('-');
      const testHyphen = path.join(basePath, ...resolved, segHyphen);
      if (fs.existsSync(testHyphen)) {
        resolved.push(segHyphen);
        i += len;
        matched = true;
        break;
      }

      // Try with dots (e.g., github.com, dev.azure.com)
      const segDot = parts.slice(i, i + len).join('.');
      const testDot = path.join(basePath, ...resolved, segDot);
      if (fs.existsSync(testDot)) {
        resolved.push(segDot);
        i += len;
        matched = true;
        break;
      }

      // Try mixed: first parts with dots, rest with hyphens (e.g., dev.azure.com)
      if (len >= 3) {
        for (let dotLen = 2; dotLen < len; dotLen++) {
          const segMixed = parts.slice(i, i + dotLen).join('.') + '/' + parts.slice(i + dotLen, i + len).join('-');
          // Skip mixed — too complex, the greedy approach above handles most cases
        }
      }
    }

    if (!matched) {
      // Single segment — just use as-is
      resolved.push(parts[i]);
      i++;
    }
  }

  return resolved.join(isWindows ? '\\' : '/');
}

export interface SessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

export interface ArchivedSessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  title: string;
  lastMessage: string;
  archivedAt: string;
  originalProjectPath: string;
  originalSessionId: string;
}

interface SessionIndexEntry {
  sessionId: string;
  fullPath?: string;
  fileMtime?: number;
  firstPrompt?: string;
  summary?: string;
  messageCount?: number;
  created?: string;
  modified?: string;
  gitBranch?: string;
  projectPath?: string;
  isSidechain?: boolean;
}

interface SessionIndexFile {
  version: number;
  entries: SessionIndexEntry[];
}

interface MessageEntry {
  type: string;
  message?: {
    role: string;
    content: string | unknown[];
  };
  timestamp?: string;
  uuid?: string;
  session_id?: string;
}

class SessionManager {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = getSessionsDir();
  }

  /**
   * Clean up special tags from prompts:
   * - <ide_opened_file>...</ide_opened_file> and other IDE tags
   * - <local-command-caveat>...</local-command-caveat> and other CLI command tags
   * - Any remaining XML-like tags (e.g. <command-name>, <command-message>, <command-args>)
   * Also handles unclosed/truncated tags.
   * Returns empty string if the entire content is tags with no meaningful text.
   */
  private cleanPrompt(prompt: string): string {
    if (!prompt) return '';
    // Strip complete XML-like tags (closed) — covers ide_*, local-command-caveat, command-*, etc.
    let cleaned = prompt.replace(/<[a-z_-]+>[\s\S]*?<\/[a-z_-]+>/g, '').trim();
    // Strip unclosed/truncated tags
    cleaned = cleaned.replace(/<[a-z_-]+>[\s\S]*/g, '').trim();
    return cleaned;
  }

  listAllProjects(): { name: string; path: string; encodedPath: string }[] {
    const projects: { name: string; path: string; encodedPath: string }[] = [];

    try {
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const encodedPath = entry.name;

          // Try to get the real projectPath from sessions-index.json first
          let realPath = '';
          try {
            const indexPath = path.join(this.sessionsDir, encodedPath, 'sessions-index.json');
            const content = fs.readFileSync(indexPath, 'utf-8');
            const parsed = JSON.parse(content);
            const indexEntries = Array.isArray(parsed.entries) ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
            // Use the first entry's projectPath as the canonical path
            for (const e of indexEntries) {
              if (e.projectPath) {
                realPath = e.projectPath;
                break;
              }
            }
          } catch {
            // No sessions-index.json or unreadable
          }

          // Fallback to decodePath if no projectPath found in index
          const decodedPath = realPath || decodePath(encodedPath);
          const projectName = path.basename(decodedPath);
          projects.push({
            name: projectName,
            path: decodedPath,
            encodedPath,
          });
        }
      }
    } catch {
      // Sessions directory may not exist yet
    }

    return projects;
  }

  listSessions(encodedOrPath: string): SessionIndexEntry[] {
    // If it looks like an encoded path (starts with -), use directly; otherwise encode it
    const encoded = encodedOrPath.startsWith('-')
      ? encodedOrPath
      : encodePath(encodedOrPath);
    const projectDir = path.join(this.sessionsDir, encoded);
    const indexPath = path.join(projectDir, 'sessions-index.json');

    let indexEntries: SessionIndexEntry[] = [];

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const parsed: SessionIndexFile = JSON.parse(content);
      if (parsed && Array.isArray(parsed.entries)) {
        indexEntries = parsed.entries;
      } else if (Array.isArray(parsed)) {
        indexEntries = parsed;
      }
    } catch {
      // No sessions-index.json — use only JSONL scan
    }

    // Always scan JSONL files and merge with index entries
    // This catches sessions that exist on disk but aren't in the index yet
    const scannedEntries = this.scanJsonlFiles(projectDir);
    const indexIds = new Set(indexEntries.map(e => e.sessionId));

    // Add any scanned sessions not already in the index
    for (const scanned of scannedEntries) {
      if (!indexIds.has(scanned.sessionId)) {
        indexEntries.push(scanned);
      }
    }

    // Re-sort by modified time descending
    indexEntries.sort((a, b) => {
      const timeA = a.modified ? new Date(a.modified).getTime() : (a.fileMtime || 0);
      const timeB = b.modified ? new Date(b.modified).getTime() : (b.fileMtime || 0);
      return timeB - timeA;
    });

    return indexEntries;
  }

  /**
   * Fallback for projects without sessions-index.json.
   * Scans .jsonl files and extracts basic session info.
   */
  private scanJsonlFiles(projectDir: string): SessionIndexEntry[] {
    const entries: SessionIndexEntry[] = [];

    try {
      const files = fs.readdirSync(projectDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(projectDir, file);

        try {
          const stat = fs.statSync(filePath);
          // Read first few lines to get the first user prompt and project path
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(8192);
          const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
          fs.closeSync(fd);

          const head = buf.toString('utf-8', 0, bytesRead);
          const lines = head.split('\n').filter((l) => l.trim());

          let firstPrompt = '';
          let projectPath = '';
          let isSidechain = false;
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              // Extract projectPath from cwd field (present in most entries)
              if (parsed.cwd && !projectPath) {
                projectPath = parsed.cwd;
              }
              // Check sidechain flag
              if (parsed.isSidechain) {
                isSidechain = true;
              }
              if (parsed.type === 'user' && parsed.message?.role === 'user') {
                const content = parsed.message.content;
                let text = '';
                if (typeof content === 'string') {
                  text = content.slice(0, 200);
                } else if (Array.isArray(content)) {
                  const textBlock = content.find((b: any) => b.type === 'text' && b.text);
                  if (textBlock) text = textBlock.text.slice(0, 200);
                }
                // Skip tag-only prompts (IDE tags, CLI command tags, etc.)
                if (text && !text.startsWith('<')) {
                  firstPrompt = text;
                  break;
                } else if (text) {
                  // Clean tags and check if there's real text underneath
                  const cleaned = this.cleanPrompt(text);
                  if (cleaned) {
                    firstPrompt = cleaned;
                    break;
                  }
                  // Keep raw as fallback if no better prompt found
                  if (!firstPrompt) firstPrompt = text;
                }
              }
            } catch {
              // skip malformed line
            }
          }

          entries.push({
            sessionId,
            fullPath: filePath,
            fileMtime: stat.mtimeMs,
            firstPrompt: firstPrompt || 'Untitled',
            summary: undefined,
            messageCount: undefined,
            created: stat.birthtime.toISOString(),
            modified: stat.mtime.toISOString(),
            projectPath: projectPath || undefined,
            isSidechain,
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    // Sort by modified time descending
    entries.sort((a, b) => (b.fileMtime || 0) - (a.fileMtime || 0));
    return entries;
  }

  /**
   * Read the first meaningful user prompt from a JSONL file (first 16KB).
   * Strips XML tags (IDE tags, CLI command tags, etc.) from text blocks.
   * If a message is entirely tags, continues to the next user message.
   */
  private readFirstPromptFromJsonl(jsonlPath: string): string {
    try {
      const fd = fs.openSync(jsonlPath, 'r');
      const buf = Buffer.alloc(16384);
      const bytesRead = fs.readSync(fd, buf, 0, 16384, 0);
      fs.closeSync(fd);

      const head = buf.toString('utf-8', 0, bytesRead);
      const lines = head.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'user' && parsed.message?.role === 'user') {
            const content = parsed.message.content;
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              // Collect all text blocks
              text = content
                .filter((b: any) => b.type === 'text' && b.text)
                .map((b: any) => b.text)
                .join('\n');
            }
            // Strip IDE tags
            const cleaned = this.cleanPrompt(text);
            if (cleaned) {
              return cleaned.slice(0, 200);
            }
            // If empty after cleaning, continue to next user message
          }
        } catch {
          // skip malformed line
        }
      }
      return '';
    } catch {
      return '';
    }
  }

  getAllSessions(): SessionInfo[] {
    const allSessions: SessionInfo[] = [];
    const projects = this.listAllProjects();

    for (const project of projects) {
      // Use encodedPath for directory lookup
      const sessions = this.listSessions(project.encodedPath);
      const projectDir = path.join(this.sessionsDir, project.encodedPath);

      for (const session of sessions) {
        if (session.isSidechain) continue; // Skip sidechain sessions
        // session.projectPath (from index) is the real path; project.path is decoded fallback
        const resolvedPath = session.projectPath || project.path;
        const resolvedName = resolvedPath
          ? resolvedPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || project.name
          : project.name;

        // Always read firstPrompt from JSONL file (not from sessions-index.json)
        const jsonlPath = path.join(projectDir, `${session.sessionId}.jsonl`);
        const firstPrompt = this.readFirstPromptFromJsonl(jsonlPath);
        const title = this.cleanPrompt(session.summary || firstPrompt.slice(0, 80) || '');

        // Skip sessions with no useful prompt (e.g. only file-history-snapshot entries)
        if (!title) continue;

        allSessions.push({
          id: session.sessionId,
          projectPath: resolvedPath,
          projectName: resolvedName,
          title,
          lastMessage: this.cleanPrompt(firstPrompt),
          updatedAt: session.modified || session.created || '',
        });
      }
    }

    // Sort by most recently updated
    allSessions.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return allSessions;
  }

  /**
   * Find the encoded directory name for a given projectPath.
   * Strategy:
   * 1. Try encodePath() directly (works for paths without spaces/special chars)
   * 2. Scan all project directories and check their sessions-index.json for matching projectPath
   * 3. Try the projectPath as-is (might already be an encoded dir name)
   */
  private findEncodedDir(projectPath: string): string | null {
    // 1. Try simple encode
    const encoded = encodePath(projectPath);
    const encodedDir = path.join(this.sessionsDir, encoded);
    if (fs.existsSync(encodedDir)) {
      return encoded;
    }

    // 2. Scan all project dirs, read sessions-index.json for projectPath match
    try {
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const indexPath = path.join(this.sessionsDir, entry.name, 'sessions-index.json');
        try {
          const content = fs.readFileSync(indexPath, 'utf-8');
          const parsed = JSON.parse(content);
          const indexEntries = Array.isArray(parsed.entries) ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
          // Check if any entry's projectPath matches
          for (const e of indexEntries) {
            if (e.projectPath === projectPath) {
              return entry.name;
            }
          }
        } catch {
          // Skip unreadable index files
        }
      }
    } catch {
      // sessionsDir doesn't exist
    }

    // 3. Try as-is
    const directDir = path.join(this.sessionsDir, projectPath);
    if (fs.existsSync(directDir)) {
      return projectPath;
    }

    return null;
  }

  getSessionMessages(projectPath: string, sessionId: string): MessageEntry[] {
    const encodedDir = this.findEncodedDir(projectPath);
    if (!encodedDir) {
      console.error(`[session] Could not find session directory for: ${projectPath}`);
      return [];
    }

    const filePath = path.join(this.sessionsDir, encodedDir, `${sessionId}.jsonl`);
    console.log(`[session] Loading messages from: ${filePath}`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const messages: MessageEntry[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          messages.push(parsed);
        } catch {
          // Skip malformed lines
        }
      }

      return messages;
    } catch {
      return [];
    }
  }

  /**
   * Fork a session: copy JSONL lines up to (and including) the message
   * identified by `cutoffUuid` into a new session file.
   * Returns the new session ID, or null on failure.
   */
  forkSession(projectPath: string, sessionId: string, cutoffUuid: string): string | null {
    const encodedDir = this.findEncodedDir(projectPath);
    if (!encodedDir) {
      console.error(`[session] fork: could not find dir for ${projectPath}`);
      return null;
    }

    const srcPath = path.join(this.sessionsDir, encodedDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(srcPath)) {
      console.error(`[session] fork: source file not found: ${srcPath}`);
      return null;
    }

    const content = fs.readFileSync(srcPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    // Find the cutoff line index — the last JSONL line whose uuid matches,
    // or whose assistant response follows the matching user message.
    // Strategy: find the line with the matching uuid, then include all
    // subsequent lines that belong to the same assistant turn (tool_result, etc.)
    let cutoffIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.uuid === cutoffUuid) {
          cutoffIndex = i;
          // If this is a user message, include the full assistant response that follows
          if (parsed.message?.role === 'user') {
            for (let j = i + 1; j < lines.length; j++) {
              try {
                const next = JSON.parse(lines[j]);
                // Keep going while we're in the same assistant turn
                if (next.message?.role === 'assistant' || next.type === 'progress' || next.type === 'file-history-snapshot') {
                  cutoffIndex = j;
                } else if (next.message?.role === 'user') {
                  // Hit the next user message — stop before it
                  break;
                } else {
                  cutoffIndex = j; // tool results, etc.
                }
              } catch { break; }
            }
          }
          break;
        }
      } catch {
        // skip malformed
      }
    }

    if (cutoffIndex < 0) {
      // Fallback: if uuid not found, try matching by message index
      // (some messages may not have uuid)
      console.warn(`[session] fork: cutoff uuid not found, copying all lines`);
      cutoffIndex = lines.length - 1;
    }

    const forkedLines = lines.slice(0, cutoffIndex + 1);
    const newSessionId = randomUUID();
    const destPath = path.join(this.sessionsDir, encodedDir, `${newSessionId}.jsonl`);

    // Rewrite session_id in each line to the new ID
    const rewritten = forkedLines.map((line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.session_id) {
          parsed.session_id = newSessionId;
        }
        return JSON.stringify(parsed);
      } catch {
        return line;
      }
    });

    fs.writeFileSync(destPath, rewritten.join('\n') + '\n', 'utf-8');
    console.log(`[session] forked ${forkedLines.length}/${lines.length} lines → ${newSessionId}`);

    return newSessionId;
  }

  watchForChanges(callback: () => void): fs.FSWatcher | null {
    try {
      const watcher = fs.watch(this.sessionsDir, { recursive: true }, () => {
        callback();
      });
      return watcher;
    } catch {
      return null;
    }
  }

  /**
   * Archive a session: move the JSONL file to the archived-sessions directory.
   * Creates a metadata file with original location info.
   */
  archiveSession(projectPath: string, sessionId: string): boolean {
    try {
      const encodedDir = this.findEncodedDir(projectPath);
      if (!encodedDir) {
        console.error('[session] archive: could not find dir for', projectPath);
        return false;
      }

      const srcPath = path.join(this.sessionsDir, encodedDir, `${sessionId}.jsonl`);
      if (!fs.existsSync(srcPath)) {
        console.error('[session] archive: source file not found:', srcPath);
        return false;
      }

      const archiveDir = getArchivedSessionsDir();
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      // Create unique archive ID
      const archivedId = `${Date.now()}-${sessionId}`;
      const destPath = path.join(archiveDir, `${archivedId}.jsonl`);
      const metaPath = path.join(archiveDir, `${archivedId}.meta.json`);

      // Read the first prompt for title
      const firstPrompt = this.readFirstPromptFromJsonl(srcPath);
      const title = this.cleanPrompt(firstPrompt.slice(0, 80) || '');

      // Move the file
      fs.renameSync(srcPath, destPath);

      // Write metadata
      const meta = {
        id: archivedId,
        originalProjectPath: projectPath,
        originalSessionId: sessionId,
        projectName: projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Unknown',
        title,
        lastMessage: firstPrompt,
        archivedAt: new Date().toISOString(),
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

      console.log('[session] archived', sessionId, '→', archivedId);
      return true;
    } catch (err) {
      console.error('[session] archive error:', err);
      return false;
    }
  }

  /**
   * Unarchive a session: move it back to the original location.
   */
  unarchiveSession(archivedSessionId: string): boolean {
    try {
      const archiveDir = getArchivedSessionsDir();
      const metaPath = path.join(archiveDir, `${archivedSessionId}.meta.json`);

      if (!fs.existsSync(metaPath)) {
        console.error('[session] unarchive: meta not found:', metaPath);
        return false;
      }

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const srcPath = path.join(archiveDir, `${archivedSessionId}.jsonl`);

      if (!fs.existsSync(srcPath)) {
        console.error('[session] unarchive: source file not found:', srcPath);
        return false;
      }

      // Find the original project directory
      const encodedDir = this.findEncodedDir(meta.originalProjectPath);
      if (!encodedDir) {
        console.error('[session] unarchive: could not find original dir for', meta.originalProjectPath);
        return false;
      }

      const destDir = path.join(this.sessionsDir, encodedDir);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Move back to original location with original session ID
      const destPath = path.join(destDir, `${meta.originalSessionId}.jsonl`);
      fs.renameSync(srcPath, destPath);

      // Remove metadata
      fs.unlinkSync(metaPath);

      console.log('[session] unarchived', archivedSessionId, '→', meta.originalSessionId);
      return true;
    } catch (err) {
      console.error('[session] unarchive error:', err);
      return false;
    }
  }

  /**
   * List all archived sessions.
   */
  listArchivedSessions(): ArchivedSessionInfo[] {
    const archived: ArchivedSessionInfo[] = [];

    try {
      const archiveDir = getArchivedSessionsDir();
      if (!fs.existsSync(archiveDir)) {
        return archived;
      }

      const files = fs.readdirSync(archiveDir);
      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;

        try {
          const metaPath = path.join(archiveDir, file);
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

          archived.push({
            id: meta.id,
            projectPath: path.join(getArchivedSessionsDir(), meta.id),
            projectName: meta.projectName || 'Unknown',
            title: meta.title || '',
            lastMessage: meta.lastMessage || '',
            archivedAt: meta.archivedAt || '',
            originalProjectPath: meta.originalProjectPath,
            originalSessionId: meta.originalSessionId,
          });
        } catch {
          // Skip invalid meta files
        }
      }
    } catch {
      // Archive directory doesn't exist
    }

    // Sort by archived date descending
    archived.sort((a, b) => {
      const dateA = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
      const dateB = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
      return dateB - dateA;
    });

    return archived;
  }
}

export const sessionManager = new SessionManager();
