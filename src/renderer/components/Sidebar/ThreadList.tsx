import React, { useMemo } from 'react';
import { ThreadItem } from './ThreadItem';
import { useAppStore } from '../../stores/appStore';
import type { SessionInfo } from '../../types';

function groupByDate(sessions: SessionInfo[]): Record<string, SessionInfo[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, SessionInfo[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  };

  for (const session of sessions) {
    const date = session.updatedAt ? new Date(session.updatedAt) : new Date(0);

    if (date >= today) {
      groups['Today'].push(session);
    } else if (date >= yesterday) {
      groups['Yesterday'].push(session);
    } else if (date >= weekAgo) {
      groups['Previous 7 days'].push(session);
    } else {
      groups['Older'].push(session);
    }
  }

  return groups;
}

export function ThreadList() {
  const { sessions, currentSession } = useAppStore();

  const grouped = useMemo(() => groupByDate(sessions), [sessions]);

  const groupOrder = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {groupOrder.map((groupName) => {
        const items = grouped[groupName];
        if (!items || items.length === 0) return null;

        return (
          <div key={groupName} className="mb-3">
            <div className="px-2 py-1.5">
              <span className="text-xs text-text-muted font-medium">
                {groupName}
              </span>
            </div>
            {items.map((session) => (
              <ThreadItem
                key={session.id}
                session={session}
                isActive={currentSession.id === session.id}
              />
            ))}
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
