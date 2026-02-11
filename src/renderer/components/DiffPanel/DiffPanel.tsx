import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGit } from '../../hooks/useGit';
import { useAppStore } from '../../stores/appStore';
import { DiffViewerModal } from './DiffViewerModal';
import type { FileChange } from '../../types';

type TabType = 'unstaged' | 'staged';

// ─── Context Menu ────────────────────────────────────────────────────

interface ChangeContextMenuProps {
  x: number;
  y: number;
  file: FileChange;
  activeTab: TabType;
  onViewDiff: () => void;
  onRevealInFiles: () => void;
  onStageUnstage: () => void;
  onClose: () => void;
}

function ChangeContextMenu({ x, y, file, activeTab, onViewDiff, onRevealInFiles, onStageUnstage, onClose }: ChangeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-surface border border-border rounded-lg shadow-xl z-[100] py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {/* View Diff */}
      <button
        onClick={() => { onViewDiff(); onClose(); }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors"
      >
        <span className="text-text-muted">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="4.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="11.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="4.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4.5 5.5v5M11.5 5.5C11.5 8.5 4.5 7 4.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span>View Diff</span>
      </button>

      {/* Reveal in Files */}
      <button
        onClick={() => { onRevealInFiles(); onClose(); }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors"
      >
        <span className="text-text-muted">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
              stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
        <span>Reveal in Files</span>
      </button>

      <div className="border-t border-border my-1" />

      {/* Stage / Unstage */}
      <button
        onClick={() => { onStageUnstage(); onClose(); }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors"
      >
        <span className="text-text-muted">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            {activeTab === 'unstaged' ? (
              <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
        </span>
        <span>{activeTab === 'unstaged' ? 'Stage File' : 'Unstage File'}</span>
      </button>
    </div>
  );
}

// ─── DiffPanel ───────────────────────────────────────────────────────

export function DiffPanel() {
  const { gitStatus, stageFile, unstageFile, commit, getDiff, refreshStatus } = useGit();
  const { setRevealFile } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('unstaged');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [diffModal, setDiffModal] = useState<{ filePath: string; diff: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileChange } | null>(null);

  const files = activeTab === 'unstaged'
    ? gitStatus?.unstaged || []
    : gitStatus?.staged || [];

  // Refresh on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleStageUnstage = async (file: FileChange) => {
    if (activeTab === 'unstaged') {
      await stageFile(file.path);
    } else {
      await unstageFile(file.path);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await commit(commitMessage.trim());
      setCommitMessage('');
    } catch (err) {
      console.error('Commit failed:', err);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleViewDiff = useCallback(async (file: FileChange) => {
    const staged = activeTab === 'staged';
    const diff = await getDiff(file.path, staged);
    if (diff) {
      setDiffModal({ filePath: file.path, diff });
    }
  }, [activeTab, getDiff]);

  const handleRevealInFiles = useCallback((file: FileChange) => {
    setRevealFile(file.path);
  }, [setRevealFile]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileChange) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const unstagedCount = gitStatus?.unstaged.length || 0;
  const stagedCount = gitStatus?.staged.length || 0;

  return (
    <>
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => { setActiveTab('unstaged'); setSelectedFile(null); }}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'unstaged'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Unstaged {unstagedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface text-[10px]">
              {unstagedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('staged'); setSelectedFile(null); }}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'staged'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Staged {stagedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface text-[10px]">
              {stagedCount}
            </span>
          )}
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            No {activeTab} changes
          </div>
        ) : (
          <div className="py-1">
            {files.map((file) => (
              <div
                key={file.path}
                className="group"
              >
                <button
                  onClick={() => setSelectedFile(
                    selectedFile === file.path ? null : file.path
                  )}
                  onDoubleClick={() => handleViewDiff(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-left
                             hover:bg-surface-hover transition-colors ${
                               selectedFile === file.path ? 'bg-accent/10' : ''
                             }`}
                >
                  <StatusBadge status={file.status} />
                  <span className={`flex-1 text-xs truncate font-mono ${
                    selectedFile === file.path ? 'text-text-primary font-medium' : 'text-text-secondary'
                  }`}>
                    {file.path}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageUnstage(file);
                    }}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded
                               text-[10px] font-medium transition-opacity
                               bg-surface-hover hover:bg-surface-active text-text-secondary"
                  >
                    {activeTab === 'unstaged' ? 'Stage' : 'Unstage'}
                  </button>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commit section */}
      {stagedCount > 0 && (
        <div className="border-t border-border p-3 shrink-0">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            rows={2}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2
                       text-xs text-text-primary placeholder-text-muted
                       outline-none focus:border-border-light resize-none"
          />
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isCommitting}
            className="mt-2 w-full py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                       hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isCommitting ? 'Committing…' : `Commit (${stagedCount} file${stagedCount !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ChangeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          activeTab={activeTab}
          onViewDiff={() => handleViewDiff(contextMenu.file)}
          onRevealInFiles={() => handleRevealInFiles(contextMenu.file)}
          onStageUnstage={() => handleStageUnstage(contextMenu.file)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Diff viewer modal */}
      {diffModal && (
        <DiffViewerModal
          filePath={diffModal.filePath}
          diff={diffModal.diff}
          onClose={() => setDiffModal(null)}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    M: 'text-warning',
    A: 'text-success',
    D: 'text-error',
    R: 'text-info',
    '?': 'text-text-muted',
    U: 'text-error',
  };

  return (
    <span className={`text-[10px] font-bold font-mono w-4 text-center ${colorMap[status] || 'text-text-muted'}`}>
      {status}
    </span>
  );
}
