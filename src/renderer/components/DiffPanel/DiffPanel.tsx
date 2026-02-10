import React, { useState, useEffect } from 'react';
import { useGit } from '../../hooks/useGit';
import { useAppStore } from '../../stores/appStore';
import { DiffViewerModal } from './DiffViewerModal';
import type { FileChange } from '../../types';

type TabType = 'unstaged' | 'staged';

export function DiffPanel() {
  const { gitStatus, stageFile, unstageFile, commit, getDiff, refreshStatus } = useGit();
  const [activeTab, setActiveTab] = useState<TabType>('unstaged');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [diffModal, setDiffModal] = useState<{ filePath: string; diff: string } | null>(null);

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
                  onDoubleClick={async () => {
                    const staged = activeTab === 'staged';
                    const diff = await getDiff(file.path, staged);
                    if (diff) {
                      setDiffModal({ filePath: file.path, diff });
                    }
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-left
                             hover:bg-surface-hover transition-colors ${
                               selectedFile === file.path ? 'bg-surface' : ''
                             }`}
                >
                  <StatusBadge status={file.status} />
                  <span className="flex-1 text-xs text-text-secondary truncate font-mono">
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
