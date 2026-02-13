import React, { useState } from 'react';
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
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [isAllCollapsed, setIsAllCollapsed] = useState(false);

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
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
            Threads
          </span>
          <button
            onClick={() => {
              if (isAllCollapsed) {
                setExpandAllKey(k => k + 1);
                setIsAllCollapsed(false);
              } else {
                setCollapseAllKey(k => k + 1);
                setIsAllCollapsed(true);
              }
            }}
            className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary
                       transition-colors"
            title={isAllCollapsed ? 'Expand all folders' : 'Collapse all folders'}
          >
            {isAllCollapsed ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 3v10M7 10l3-3 3 3M7 6l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 3v10M7 6l3-3 3 3M7 10l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <ThreadList collapseAllKey={collapseAllKey} expandAllKey={expandAllKey} />
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
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
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
