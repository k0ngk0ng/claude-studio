import React, { useCallback, useState } from 'react';
import { useSessions } from '../../hooks/useSessions';
import type { SessionInfo } from '../../types';

interface ThreadItemProps {
  session: SessionInfo;
  isActive: boolean;
  isRunning?: boolean;
  timeLabel?: string;
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '…';
}

export function ThreadItem({ session, isActive, isRunning, timeLabel }: ThreadItemProps) {
  const { selectSession } = useSessions();
  const [isArchiving, setIsArchiving] = useState(false);

  const handleClick = useCallback(() => {
    selectSession(session);
  }, [selectSession, session]);

  const handleArchive = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isArchiving) return;

    // Confirm before archiving
    const confirmed = window.confirm('Archive this thread? You can restore it later from Settings.');
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      await window.api.sessions.archive(session.projectPath, session.id);
    } finally {
      setIsArchiving(false);
    }
  }, [session.projectPath, session.id, isArchiving]);

  const title = session.title || session.lastMessage || 'New conversation';

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md mb-0.5
        transition-colors duration-150 group
        ${
          isActive
            ? 'bg-surface-active text-text-primary'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }
        ${isArchiving ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Running indicator */}
      {isRunning && (
        <span className="shrink-0 relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
        </span>
      )}

      {/* Title */}
      <span className="flex-1 text-[13px] font-medium truncate leading-snug">
        {truncate(title, 45)}
      </span>

      {/* Right side: time label + archive button overlapping */}
      <div className="relative min-w-[40px] h-[18px] flex items-center justify-end">
        {/* Time label - hidden on hover but reserves space */}
        {timeLabel && (
          <span className="text-[11px] text-text-muted group-hover:invisible whitespace-nowrap">
            {timeLabel}
          </span>
        )}

        {/* Archive button - appears on hover at same position as time */}
        <button
          onClick={handleArchive}
          disabled={isArchiving}
          className="absolute right-0 p-0.5 rounded text-text-muted hover:text-text-primary
                     hover:bg-surface-hover transition-colors opacity-0 group-hover:opacity-100
                     disabled:opacity-50"
          title="Archive thread"
        >
          {isArchiving ? (
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
              <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M13 4.5H3a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1v-8a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 4.5l1.5 9h9l1.5-9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M6 4.5V3.5a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
      </div>
    </button>
  );
}
