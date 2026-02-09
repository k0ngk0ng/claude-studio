import React, { useCallback } from 'react';
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

  const handleClick = useCallback(() => {
    selectSession(session);
  }, [selectSession, session]);

  const title = session.title || session.lastMessage || 'New conversation';

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md mb-0.5
        transition-colors duration-150
        ${
          isActive
            ? 'bg-surface-active text-text-primary'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }
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
        {truncate(title, 50)}
      </span>

      {/* Time label */}
      {timeLabel && (
        <span className="shrink-0 text-[11px] text-text-muted">
          {timeLabel}
        </span>
      )}
    </button>
  );
}
