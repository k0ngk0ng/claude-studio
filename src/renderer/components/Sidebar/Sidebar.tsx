import React from 'react';
import { ThreadList } from './ThreadList';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';

interface SidebarProps {
  onNewThread: () => void;
}

export function Sidebar({ onNewThread }: SidebarProps) {
  const { platform, setCurrentProject, panelSizes, setPanelSize } = useAppStore();
  const { openSettings } = useSettingsStore();
  const isMac = platform === 'mac';

  const { handleMouseDown } = useResizable({
    direction: 'horizontal',
    size: panelSizes.sidebar,
    minSize: 180,
    maxSize: 480,
    reverse: true,
    onResize: (size) => setPanelSize('sidebar', size),
  });

  const handleAddFolder = async () => {
    const selected = await window.api.app.selectDirectory();
    if (selected) {
      const name = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || selected;
      setCurrentProject({ path: selected, name });

      // Try to get git branch
      try {
        const branch = await window.api.git.branch(selected);
        setCurrentProject({ path: selected, name, branch });
      } catch {
        // Not a git repo
      }
    }
  };

  return (
    <div
      className="relative flex flex-col bg-sidebar border-r border-border h-full shrink-0"
      style={{ width: panelSizes.sidebar }}
    >
      {/* Drag region for macOS traffic lights */}
      {isMac && <div className="titlebar-drag h-13 shrink-0" />}
      {!isMac && <div className="h-2 shrink-0" />}

      {/* New thread + Add folder buttons */}
      <div className="px-3 pb-2 flex gap-1.5">
        <button
          onClick={onNewThread}
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg
                     bg-surface hover:bg-surface-hover text-text-primary text-sm
                     transition-colors duration-150 titlebar-no-drag"
        >
          <svg
            width="15"
            height="15"
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
        <button
          onClick={handleAddFolder}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary
                     transition-colors duration-150 titlebar-no-drag shrink-0"
          title="Add folder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M8 7v4M6 9h4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Threads section */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 py-2">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Threads
          </span>
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

      {/* Right-edge resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 -right-[2px] w-[5px] h-full cursor-col-resize z-10 group"
      >
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2
                        opacity-0 group-hover:opacity-100 bg-accent/50 transition-opacity" />
      </div>
    </div>
  );
}
