import fs from 'fs';
import path from 'path';
import { getSessionsDir, encodePath } from './platform';

const isWindows = process.platform === 'win32';

export interface SessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
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

  listAllProjects(): { name: string; path: string; encodedPath: string }[] {
    const projects: { name: string; path: string; encodedPath: string }[] = [];

    try {
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // The directory name is the encoded project path
          const encodedPath = entry.name;
          // Try to decode the path back
          // On Windows, encoded paths look like "C-Users-foo-project"
          // On Unix, encoded paths look like "Users-foo-project"
          let decodedPath: string;
          if (isWindows) {
            // Heuristic: if second segment is a single char, treat it as a drive letter
            // e.g., "C-Users-foo" → "C:\Users\foo"
            const parts = encodedPath.split('-');
            if (parts.length >= 2 && parts[0].length === 1 && /^[A-Za-z]$/.test(parts[0])) {
              decodedPath = parts[0] + ':\\' + parts.slice(1).join('\\');
            } else {
              decodedPath = '\\' + encodedPath.replace(/-/g, '\\');
            }
          } else {
            decodedPath = '/' + encodedPath.replace(/-/g, '/');
          }
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

  listSessions(projectPath: string): SessionIndexEntry[] {
    const encoded = encodePath(projectPath);
    const indexPath = path.join(this.sessionsDir, encoded, 'sessions-index.json');

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const parsed: SessionIndexFile = JSON.parse(content);
      // The file format is { version: 1, entries: [...] }
      if (parsed && Array.isArray(parsed.entries)) {
        return parsed.entries;
      }
      // Fallback: if it's already an array
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  }

  getAllSessions(): SessionInfo[] {
    const allSessions: SessionInfo[] = [];
    const projects = this.listAllProjects();

    for (const project of projects) {
      const sessions = this.listSessions(project.path);
      for (const session of sessions) {
        if (session.isSidechain) continue; // Skip sidechain sessions
        const resolvedPath = session.projectPath || project.path;
        const resolvedName = resolvedPath
          ? resolvedPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || project.name
          : project.name;
        allSessions.push({
          id: session.sessionId,
          projectPath: resolvedPath,
          projectName: resolvedName,
          title: session.summary || session.firstPrompt?.slice(0, 80) || 'Untitled',
          lastMessage: session.firstPrompt || '',
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

  getSessionMessages(projectPath: string, sessionId: string): MessageEntry[] {
    const encoded = encodePath(projectPath);
    const sessionFile = path.join(this.sessionsDir, encoded, `${sessionId}.jsonl`);

    try {
      const content = fs.readFileSync(sessionFile, 'utf-8');
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
}

export const sessionManager = new SessionManager();
