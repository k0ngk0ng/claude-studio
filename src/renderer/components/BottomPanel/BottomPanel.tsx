import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';
import { TerminalPanel } from '../Terminal/TerminalPanel';
import { LogPanel } from '../Debug/LogPanel';

type BottomTab = 'terminal' | 'logs';

export function BottomPanel() {
  const { panels, togglePanel, panelSizes, setPanelSize } = useAppStore();
  const debugMode = useSettingsStore(s => s.settings.general.debugMode);

  // Determine initial active tab
  const [activeTab, setActiveTab] = useState<BottomTab>(
    panels.logs && !panels.terminal ? 'logs' : 'terminal'
  );

  // Sync active tab when panels change externally
  React.useEffect(() => {
    if (panels.terminal && !panels.logs) setActiveTab('terminal');
    else if (panels.logs && !panels.terminal) setActiveTab('logs');
  }, [panels.terminal, panels.logs]);

  const { handleMouseDown } = useResizable({
    direction: 'vertical',
    size: panelSizes.terminal,
    minSize: 120,
    maxSize: 600,
    reverse: false,
    onResize: (size) => setPanelSize('terminal', size),
  });

  const handleTabClick = (tab: BottomTab) => {
    setActiveTab(tab);
  };

  const handleClose = () => {
    if (panels.terminal) togglePanel('terminal');
    if (panels.logs) togglePanel('logs');
  };

  // Only show logs tab if debug mode is on
  const showLogTab = debugMode;

  return (
    <div
      className="relative shrink-0 border-t border-border bg-bg"
      style={{ height: panelSizes.terminal }}
    >
      {/* Top-edge resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute -top-[2px] left-0 right-0 h-[5px] cursor-row-resize z-10 group"
      >
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2
                        opacity-0 group-hover:opacity-100 bg-accent/50 transition-opacity" />
      </div>

      {/* Tab header */}
      <div className="flex items-center justify-between border-b border-border bg-surface shrink-0">
        <div className="flex items-center">
          {/* Terminal tab */}
          <button
            onClick={() => handleTabClick('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
              border-b-2 ${activeTab === 'terminal'
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="8.5" y1="10" x2="11.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Terminal
          </button>

          {/* Logs tab — only when debug mode is on */}
          {showLogTab && (
            <button
              onClick={() => handleTabClick('logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
                border-b-2 ${activeTab === 'logs'
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 3h12M2 6.5h12M2 10h8M2 13.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Debug Logs
            </button>
          )}
        </div>

        {/* Right side: cwd + close */}
        <div className="flex items-center gap-2">
          {activeTab === 'terminal' && (
            <span className="text-[10px] text-text-muted truncate max-w-[200px]">
              {useAppStore.getState().currentProject.path}
            </span>
          )}
          <button
            onClick={handleClose}
            className="p-1 mr-2 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ height: 'calc(100% - 33px)' }}>
        <div className={activeTab === 'terminal' ? 'h-full' : 'hidden'}>
          <TerminalPanel bare />
        </div>
        {activeTab === 'logs' && (
          <div className="h-full">
            <LogPanel />
          </div>
        )}
      </div>
    </div>
  );
}
