import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/appStore';
import { useResizable } from '../../hooks/useResizable';
import { DiffPanel } from './DiffPanel';
import { FileTree } from './FileTree';
import { HistoryPanel } from './HistoryPanel';

type RightTab = 'changes' | 'files' | 'history';

export function RightPanel({ visible }: { visible?: boolean }) {
  const { t } = useTranslation();
  const { togglePanel, panelSizes, setPanelSize, gitStatus, revealFile } = useAppStore();
  const [activeTab, setActiveTab] = useState<RightTab>('files');

  // When revealFile is set, switch to Files tab
  useEffect(() => {
    if (revealFile) {
      setActiveTab('files');
    }
  }, [revealFile]);

  const { handleMouseDown } = useResizable({
    direction: 'horizontal',
    size: panelSizes.diff,
    minSize: 250,
    maxSize: 700,
    reverse: false,
    onResize: (size) => setPanelSize('diff', size),
  });

  const unstagedCount = gitStatus?.unstaged.length || 0;
  const stagedCount = gitStatus?.staged.length || 0;
  const totalChanges = unstagedCount + stagedCount;

  return (
    <div
      className="relative border-l border-border bg-bg flex flex-col h-full shrink-0"
      style={{
        width: visible ? panelSizes.diff : 0,
        display: visible ? undefined : 'none',
      }}
    >
      {/* Left-edge resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 -left-[2px] w-[5px] h-full cursor-col-resize z-10 group"
      >
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2
                        opacity-0 group-hover:opacity-100 bg-accent/50 transition-opacity" />
      </div>

      {/* Tab header */}
      <div className="flex items-center justify-between border-b border-border bg-surface shrink-0">
        <div className="flex items-center">
          {/* Files tab */}
          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors
              border-b-2 ${activeTab === 'files'
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
                stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {t('diff.files')}
          </button>

          {/* Changes tab */}
          <button
            onClick={() => setActiveTab('changes')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors
              border-b-2 ${activeTab === 'changes'
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="4.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="11.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="4.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 5.5v5M11.5 5.5C11.5 8.5 4.5 7 4.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {t('diff.changes')}
            {totalChanges > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-medium">
                {totalChanges}
              </span>
            )}
          </button>

          {/* History tab */}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors
              border-b-2 ${activeTab === 'history'
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('diff.history')}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={() => togglePanel('diff')}
          className="p-1 mr-2 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Tab content — always mounted, hidden via CSS to preserve state */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col" style={{ display: activeTab === 'changes' ? undefined : 'none' }}>
          <DiffPanel />
        </div>
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col" style={{ display: activeTab === 'files' ? undefined : 'none' }}>
          <FileTree />
        </div>
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col" style={{ display: activeTab === 'history' ? undefined : 'none' }}>
          <HistoryPanel />
        </div>
      </div>
    </div>
  );
}
