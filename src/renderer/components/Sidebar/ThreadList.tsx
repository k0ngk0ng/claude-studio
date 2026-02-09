import React, { useMemo, useState } from 'react';
import { ThreadItem } from './ThreadItem';
import { useAppStore } from '../../stores/appStore';
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

export function ThreadList() {
  const { sessions, currentSession, currentProject } = useAppStore();
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Whether we have an unsaved new thread (no session_id yet)
  const hasUntitledThread = currentSession.id === null;
  const untitledProjectPath = currentSession.projectPath || currentProject.path;

  const projectGroups = useMemo(() => {
    const groups = groupByProject(sessions);

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
  }, [sessions, hasUntitledThread, untitledProjectPath]);

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

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {projectGroups.map((group) => {
        const key = group.projectPath || group.projectName;
        const isCollapsed = collapsedProjects.has(key);

        return (
          <div key={key} className="mb-1">
            {/* Project folder header */}
            <Tooltip text={group.projectPath}>
            <button
              onClick={() => toggleProject(key)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors group"
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
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`shrink-0 opacity-40 transition-transform duration-150 ${
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
                    timeLabel={formatRelativeTime(session.updatedAt)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {sessions.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-text-muted">No threads yet</p>
          <p className="text-xs text-text-muted mt-1">
            Start a new conversation
          </p>
        </div>
      )}
    </div>
  );
}
