import React, { useRef, useCallback } from 'react';
import { useTabStore, type TabInfo } from '../../stores/tabStore';
import { useAppStore } from '../../stores/appStore';

interface TabBarProps {
  onTabSelect: (tab: TabInfo) => void;
  onTabClose: (tabId: string) => void;
  onNewThread: () => void;
}

export function TabBar({ onTabSelect, onTabClose, onNewThread }: TabBarProps) {
  const { openTabs, activeTabId } = useTabStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tab: TabInfo) => {
      // Middle-click to close
      if (e.button === 1) {
        e.preventDefault();
        onTabClose(tab.id);
      }
    },
    [onTabClose]
  );

  if (openTabs.length === 0) return null;

  return (
    <div
      className="flex items-center bg-bg border-b border-border shrink-0 h-10 min-h-[40px]"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-tab-empty]')) {
          onNewThread();
        }
      }}
    >
      {/* Tab area — tabs shrink like Chrome when space is tight */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-stretch overflow-hidden min-w-0"
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) {
            onNewThread();
          }
        }}
      >
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isStreaming = getTabStreaming(tab.id);

          return (
            <div
              key={tab.id}
              onMouseDown={(e) => handleMouseDown(e, tab)}
              onClick={() => onTabSelect(tab)}
              onDoubleClick={(e) => e.stopPropagation()}
              className={`
                group relative flex items-center gap-1.5 px-3 h-full
                cursor-pointer select-none max-w-[200px] min-w-[40px]
                border-r border-border text-xs transition-colors
                ${isActive
                  ? 'bg-surface text-text-primary shrink-0'
                  : 'bg-bg text-text-secondary hover:bg-surface-hover hover:text-text-primary shrink'
                }
              `}
              style={{ flexBasis: '160px' }}
            >
              {/* Active tab top indicator */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
              )}

              {/* Streaming dot */}
              {isStreaming && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              )}

              {/* Title */}
              <span className="truncate flex-1 min-w-0">
                {tab.isNew ? 'New Thread' : (tab.title || 'Thread')}
              </span>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className={`
                  shrink-0 w-5 h-5 rounded flex items-center justify-center
                  transition-colors
                  ${isActive
                    ? 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                    : 'text-transparent group-hover:text-text-muted hover:!text-text-primary hover:!bg-surface-hover'
                  }
                `}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2.5 2.5l5 5M7.5 2.5l-5 5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          );
        })}

        {/* New tab button — right after the last tab */}
        <button
          onClick={onNewThread}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-10 shrink-0 self-stretch
                     text-text-muted hover:text-text-primary hover:bg-surface-hover
                     transition-colors"
          title="New thread (⌘N)"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 2v8M2 6h8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Check if a tab's session is currently streaming */
function getTabStreaming(tabId: string): boolean {
  const state = useAppStore.getState();
  // Active session
  if (state.currentSession.id === tabId) {
    return state.currentSession.isStreaming;
  }
  // Background runtime
  const runtime = state.sessionRuntimes.get(tabId);
  return runtime?.isStreaming ?? false;
}
