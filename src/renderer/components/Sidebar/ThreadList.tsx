import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ThreadItem } from './ThreadItem';
import { useAppStore } from '../../stores/appStore';
import { useSessions } from '../../hooks/useSessions';
import { Tooltip } from '../common/Tooltip';
import type { SessionInfo } from '../../types';

interface ProjectGroup {
  projectName: string;
  projectPath: string;
  sessions: SessionInfo[];
}

function groupByProject(sessions: SessionInfo[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();

  for (const session of sessions) {
    const key = session.projectPath || session.projectName;
    if (!map.has(key)) {
      map.set(key, {
        projectName: session.projectName,
        projectPath: session.projectPath,
        sessions: [],
      });
    }
    map.get(key)!.sessions.push(session);
  }

  // Sort groups: most recently updated project first
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    const aTime = a.sessions[0]?.updatedAt ? new Date(a.sessions[0].updatedAt).getTime() : 0;
    const bTime = b.sessions[0]?.updatedAt ? new Date(b.sessions[0].updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  return groups;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${diffMonths}mo`;
}

export function ThreadList({ collapseAllKey, expandAllKey }: { collapseAllKey: number; expandAllKey: number }) {
  const { sessions, currentSession, currentProject, sessionRuntimes } = useAppStore();
  const { createNewSession } = useSessions();
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Which sessions have active running processes
  const runningIds = useMemo(() => {
    const ids: string[] = [];
    // Current session
    if (currentSession.processId && currentSession.id) {
      ids.push(currentSession.id);
    }
    // Background runtimes
    for (const [key, runtime] of sessionRuntimes) {
      if (runtime.processId && !ids.includes(key)) {
        ids.push(key);
      }
    }
    return ids;
  }, [currentSession.processId, currentSession.id, sessionRuntimes]);

  // Whether we have an unsaved new thread (temp ID starting with "new-")
  const hasUntitledThread = currentSession.id !== null && currentSession.id.startsWith('new-');
  const untitledProjectPath = currentSession.projectPath || currentProject.path;

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.projectName || '').toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const projectGroups = useMemo(() => {
    const groups = groupByProject(filteredSessions);

    // If there's an untitled thread, ensure its project group exists
    if (hasUntitledThread && untitledProjectPath) {
      const exists = groups.some(
        (g) => g.projectPath === untitledProjectPath
      );
      if (!exists) {
        // Create a temporary group for this project
        const name = untitledProjectPath.split('/').filter(Boolean).pop() || untitledProjectPath;
        groups.unshift({
          projectName: name,
          projectPath: untitledProjectPath,
          sessions: [],
        });
      }
    }

    return groups;
  }, [filteredSessions, hasUntitledThread, untitledProjectPath]);

  const toggleProject = (key: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Collapse all when collapseAllKey bumps
  useEffect(() => {
    if (collapseAllKey > 0) {
      const allKeys = new Set(projectGroups.map((g) => g.projectPath || g.projectName));
      setCollapsedProjects(allKeys);
    }
  }, [collapseAllKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expand all when expandAllKey bumps
  useEffect(() => {
    if (expandAllKey > 0) {
      setCollapsedProjects(new Set());
    }
  }, [expandAllKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewThreadInProject = useCallback((projectPath: string, projectName: string) => {
    createNewSession(projectPath);
    useAppStore.getState().setCurrentProject({ path: projectPath, name: projectName });
  }, [createNewSession]);

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {/* Search filter */}
      {sessions.length > 5 && (
        <div className="px-1 pb-2 pt-1 sticky top-0 bg-sidebar z-10">
          <div className="relative">
            <svg
              width="12" height="12" viewBox="0 0 16 16" fill="none"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter threads…"
              className="w-full bg-surface border border-border rounded-md pl-7 pr-2 py-1
                         text-xs text-text-primary placeholder-text-muted
                         outline-none focus:border-accent/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded
                           text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {projectGroups.map((group) => {
        const key = group.projectPath || group.projectName;
        const isCollapsed = collapsedProjects.has(key);

        return (
          <div key={key} className="mb-1">
            {/* Project folder header */}
            <Tooltip text={group.projectPath}>
            <div className="flex items-center gap-0 group">
              <button
                onClick={() => toggleProject(key)}
                className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-md
                           text-text-secondary hover:text-text-primary hover:bg-surface-hover
                           transition-colors"
              >
                {/* Folder icon */}
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
                  <path
                    d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                <span className="text-[13px] font-semibold truncate flex-1 text-left">
                  {group.projectName}
                </span>
                {/* Collapse indicator + count */}
                <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                  {group.sessions.length}
                </span>
              </button>
              {/* New thread button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNewThreadInProject(group.projectPath, group.projectName);
                }}
                className="shrink-0 p-1 rounded text-text-muted hover:text-text-primary
                           hover:bg-surface-hover transition-colors
                           opacity-0 group-hover:opacity-100"
                title="New thread in this project"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {/* Collapse chevron */}
              <button
                onClick={() => toggleProject(key)}
                className="shrink-0 p-1 rounded text-text-muted hover:text-text-primary
                           hover:bg-surface-hover transition-colors"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className={`opacity-40 transition-transform duration-150 ${
                    isCollapsed ? '-rotate-90' : ''
                  }`}
                >
                  <path
                    d="M3 4l2 2 2-2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            </Tooltip>

            {/* Thread items */}
            {!isCollapsed && (
              <div className="ml-1">
                {/* Temporary "Untitled" thread for new unsaved session */}
                {hasUntitledThread && group.projectPath === untitledProjectPath && (
                  <button
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md mb-0.5
                               bg-surface-active text-text-primary transition-colors duration-150"
                  >
                    {/* Running indicator for untitled thread */}
                    {currentSession.processId && (
                      <span className="shrink-0 relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                    )}
                    <span className="flex-1 text-[13px] font-medium truncate leading-snug italic opacity-70">
                      Untitled
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      now
                    </span>
                  </button>
                )}
                {group.sessions.map((session) => (
                  <ThreadItem
                    key={session.id}
                    session={session}
                    isActive={currentSession.id === session.id}
                    isRunning={runningIds.includes(session.id)}
                    timeLabel={formatRelativeTime(session.updatedAt)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {sessions.length === 0 && !searchQuery && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-text-muted">No threads yet</p>
          <p className="text-xs text-text-muted mt-1">
            Start a new conversation
          </p>
        </div>
      )}

      {searchQuery && filteredSessions.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-text-muted">No matching threads</p>
        </div>
      )}
    </div>
  );
}
