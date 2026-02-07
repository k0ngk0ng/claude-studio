import React from 'react';
import { useAppStore } from '../../stores/appStore';

export function ArchivedThreadsSection() {
  const { sessions } = useAppStore();

  // For now, show all sessions as a simple list — archiving feature can be added later
  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Archived Threads</h2>
      <p className="text-sm text-text-muted mb-6">
        View and manage past conversation threads.
      </p>

      {sessions.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <svg
            width="32"
            height="32"
            viewBox="0 0 16 16"
            fill="none"
            className="mx-auto mb-3 text-text-muted"
          >
            <path d="M2 4h12v1.5H2V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M3 5.5v7h10v-7" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-text-muted">No archived threads</p>
        </div>
      ) : (
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg
                         hover:bg-surface-hover transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text-primary truncate">{session.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted">{session.projectName}</span>
                  {session.updatedAt && (
                    <>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs text-text-muted">
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
