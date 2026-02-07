import React from 'react';
import { useAppStore } from '../../stores/appStore';

export function StatusBar() {
  const { currentProject, currentSession } = useAppStore();

  return (
    <div className="flex items-center justify-between px-3 h-6 shrink-0 border-t border-border bg-sidebar text-[11px]">
      {/* Left: connection status */}
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-text-muted">Local</span>
      </div>

      {/* Center: git branch */}
      <div className="flex items-center gap-1.5 text-text-muted">
        {currentProject.branch && (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M5 3v6.5a2.5 2.5 0 005 0V8M5 3L3 5M5 3l2 2M11 13V6.5a2.5 2.5 0 00-5 0V8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-mono">{currentProject.branch}</span>
          </>
        )}
      </div>

      {/* Right: access mode */}
      <div className="flex items-center gap-1.5">
        {currentSession.processId && (
          <div className="flex items-center gap-1 mr-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-text-muted">Active</span>
          </div>
        )}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1a4 4 0 00-4 4v3H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a4 4 0 00-4-4z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <span className="text-text-muted">Full access</span>
      </div>
    </div>
  );
}
