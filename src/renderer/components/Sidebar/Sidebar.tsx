import React from 'react';
import { ThreadList } from './ThreadList';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessions } from '../../hooks/useSessions';

interface SidebarProps {
  onNewThread: () => void;
}

export function Sidebar({ onNewThread }: SidebarProps) {
  const { platform } = useAppStore();
  const { openSettings } = useSettingsStore();
  const { loadSessions } = useSessions();
  const isMac = platform === 'mac';

  return (
    <div className="flex flex-col w-60 min-w-60 bg-sidebar border-r border-border h-full">
      {/* Drag region for macOS traffic lights */}
      {isMac && <div className="titlebar-drag h-13 shrink-0" />}
      {!isMac && <div className="h-2 shrink-0" />}

      {/* New thread button */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewThread}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg
                     bg-surface hover:bg-surface-hover text-text-primary text-sm
                     transition-colors duration-150 titlebar-no-drag"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>New thread</span>
        </button>
      </div>

      {/* Threads section */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Threads
          </span>
          <button
            onClick={() => loadSessions()}
            className="p-1 rounded text-text-muted hover:text-text-primary
                       hover:bg-surface-hover transition-colors titlebar-no-drag"
            title="Refresh threads"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 8a5.5 5.5 0 01-9.27 4.01M2.5 8a5.5 5.5 0 019.27-4.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M13.5 3v5h-5M2.5 13V8h5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <ThreadList />
      </div>

      {/* Settings link */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={openSettings}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg
                     text-text-secondary hover:text-text-primary hover:bg-surface
                     text-sm transition-colors duration-150 titlebar-no-drag"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M8 10a2 2 0 100-4 2 2 0 000 4z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M13.5 8a5.5 5.5 0 01-.44 2.16l1.13.65-.75 1.3-1.13-.65A5.5 5.5 0 018 13.5v1.3h-1.5v-1.3a5.5 5.5 0 01-3.81-2.04l-1.13.65-.75-1.3 1.13-.65A5.5 5.5 0 012.5 8a5.5 5.5 0 01.44-2.16l-1.13-.65.75-1.3 1.13.65A5.5 5.5 0 018 2.5V1.2h1.5v1.3a5.5 5.5 0 013.81 2.04l1.13-.65.75 1.3-1.13.65c.28.68.44 1.4.44 2.16z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
