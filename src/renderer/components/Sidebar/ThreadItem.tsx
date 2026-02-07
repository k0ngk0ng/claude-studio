import React, { useCallback } from 'react';
import { useSessions } from '../../hooks/useSessions';
import type { SessionInfo } from '../../types';

interface ThreadItemProps {
  session: SessionInfo;
  isActive: boolean;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '…';
}

export function ThreadItem({ session, isActive }: ThreadItemProps) {
  const { selectSession } = useSessions();

  const handleClick = useCallback(() => {
    selectSession(session);
  }, [selectSession, session]);

  const summary = session.lastMessage || session.title || 'New conversation';

  return (
    <button
      onClick={handleClick}
      className={`
        w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-colors duration-150
        ${
          isActive
            ? 'bg-surface-active text-text-primary'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }
      `}
    >
      {/* Project name */}
      <div className="text-[11px] text-text-muted truncate mb-0.5">
        {session.projectName}
      </div>

      {/* Message summary */}
      <div className="text-sm leading-snug truncate">
        {truncate(summary, 60)}
      </div>

      {/* Timestamp */}
      <div className="text-[11px] text-text-muted mt-0.5">
        {formatRelativeTime(session.updatedAt)}
      </div>
    </button>
  );
}
