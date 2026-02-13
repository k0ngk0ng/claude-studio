import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { DiffViewerModal } from './DiffViewerModal';
import type { GitCommit } from '../../types';

interface CommitFile {
  path: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-warning',
  A: 'text-success',
  D: 'text-error',
  R: 'text-info',
};

// ─── Context Menu ────────────────────────────────────────────────────

interface FileContextMenuProps {
  x: number;
  y: number;
  onViewDiff: () => void;
  onRevealInFiles: () => void;
  onCopyPath: () => void;
  onClose: () => void;
}

function FileContextMenu({ x, y, onViewDiff, onRevealInFiles, onCopyPath, onClose }: FileContextMenuProps) {
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

      {/* Copy Path */}
      <button
        onClick={() => { onCopyPath(); onClose(); }}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors"
      >
        <span className="text-text-muted">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span>Copy Path</span>
      </button>
    </div>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────

export function HistoryPanel() {
  const { currentProject, setRevealFile, gitStatus } = useAppStore();
  const cwd = currentProject.path;

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffModal, setDiffModal] = useState<{ filePath: string; diff: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hash: string; file: CommitFile } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const loadCommits = useCallback(() => {
    if (!cwd) return;
    setLoading(true);
    window.api.git.log(cwd, 200).then(result => {
      setCommits(result);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [cwd]);

  // Load on mount / cwd change
  useEffect(() => {
    loadCommits();
  }, [loadCommits]);

  // Auto-refresh when gitStatus changes (e.g. after a commit in Changes tab)
  const prevStagedRef = useRef(gitStatus?.staged.length ?? 0);
  useEffect(() => {
    const stagedCount = gitStatus?.staged.length ?? 0;
    // When staged count drops to 0 from non-zero, a commit likely happened
    if (prevStagedRef.current > 0 && stagedCount === 0) {
      loadCommits();
    }
    prevStagedRef.current = stagedCount;
  }, [gitStatus?.staged.length, loadCommits]);

  const toggleCommit = useCallback(async (hash: string) => {
    if (expandedHash === hash) {
      setExpandedHash(null);
      setSelectedFile(null);
      return;
    }
    setExpandedHash(hash);
    setSelectedFile(null);
    // Load files if not cached
    if (!commitFiles[hash]) {
      setLoadingFiles(hash);
      try {
        const files = await window.api.git.showCommitFiles(cwd, hash);
        setCommitFiles(prev => ({ ...prev, [hash]: files }));
      } catch {
        setCommitFiles(prev => ({ ...prev, [hash]: [] }));
      } finally {
        setLoadingFiles(null);
      }
    }
  }, [expandedHash, commitFiles, cwd]);

  const handleViewDiff = useCallback(async (hash: string, filePath: string) => {
    try {
      const diff = await window.api.git.showCommitFileDiff(cwd, hash, filePath);
      if (diff) {
        setDiffModal({ filePath, diff });
      }
    } catch (err) {
      console.error('Failed to get commit diff:', err);
    }
  }, [cwd]);

  const handleRevealInFiles = useCallback((filePath: string) => {
    setRevealFile(filePath);
  }, [setRevealFile]);

  const handleCopyPath = useCallback((filePath: string) => {
    navigator.clipboard.writeText(filePath);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, hash: string, file: CommitFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, hash, file });
  }, []);

  const filteredCommits = useMemo(() => {
    if (!filterQuery.trim()) return commits;
    const q = filterQuery.toLowerCase();
    return commits.filter(c =>
      c.subject.toLowerCase().includes(q) ||
      c.shortHash.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q)
    );
  }, [commits, filterQuery]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
        }
        return `${diffHours}h ago`;
      }
      if (diffDays === 1) return 'yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } catch {
      return dateStr;
    }
  };

  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading commits…
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No commits found
      </div>
    );
  }

  return (
    <>
      {/* Filter */}
      <div className="px-2 py-2 border-b border-border shrink-0">
        <div className="relative flex items-center gap-1">
          <div className="relative flex-1">
            <svg
              width="12" height="12" viewBox="0 0 16 16" fill="none"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter commits…"
              className="w-full bg-surface border border-border rounded-md pl-7 pr-2 py-1
                         text-xs text-text-primary placeholder-text-muted
                         outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={loadCommits}
            disabled={loading}
            className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary
                       transition-colors shrink-0 disabled:opacity-40"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={loading ? 'animate-spin' : ''}>
              <path d="M13.5 8a5.5 5.5 0 01-9.8 3.4M2.5 8a5.5 5.5 0 019.8-3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M3.5 14.5v-3h3M12.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="py-1">
          {filteredCommits.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {filterQuery ? 'No matching commits' : 'No commits'}
            </div>
          ) : filteredCommits.map((commit) => {
            const isExpanded = expandedHash === commit.hash;
            const files = commitFiles[commit.hash];
            const isLoadingThis = loadingFiles === commit.hash;

            return (
              <div key={commit.hash}>
                {/* Commit row */}
                <button
                  onClick={() => toggleCommit(commit.hash)}
                  className={`flex items-start gap-2 w-full px-3 py-2 text-left
                             hover:bg-surface-hover transition-colors ${
                               isExpanded ? 'bg-accent/5' : ''
                             }`}
                >
                  {/* Expand chevron */}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className={`shrink-0 mt-0.5 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-accent shrink-0">{commit.shortHash}</span>
                      <span className="text-xs text-text-primary truncate">{commit.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-muted truncate">{commit.author}</span>
                      <span className="text-[10px] text-text-muted">·</span>
                      <span className="text-[10px] text-text-muted shrink-0">{formatDate(commit.date)}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded file list */}
                {isExpanded && (
                  <div className="bg-surface/50 border-y border-border/50">
                    {isLoadingThis ? (
                      <div className="px-8 py-3 text-xs text-text-muted">Loading files…</div>
                    ) : files && files.length > 0 ? (
                      files.map((file) => {
                        const fileKey = `${commit.hash}:${file.path}`;
                        const isSelected = selectedFile === fileKey;
                        return (
                          <button
                            key={file.path}
                            onClick={() => setSelectedFile(isSelected ? null : fileKey)}
                            onDoubleClick={() => handleViewDiff(commit.hash, file.path)}
                            onContextMenu={(e) => handleContextMenu(e, commit.hash, file)}
                            className={`flex items-center gap-2 w-full px-6 py-1.5 text-left
                                       hover:bg-surface-hover transition-colors group ${
                                         isSelected ? 'bg-accent/10' : ''
                                       }`}
                          >
                            <span className={`text-[10px] font-bold font-mono w-4 text-center ${STATUS_COLORS[file.status] || 'text-text-muted'}`}>
                              {file.status}
                            </span>
                            <span className={`text-xs font-mono truncate ${
                              isSelected ? 'text-text-primary font-medium' : 'text-text-secondary group-hover:text-text-primary'
                            }`}>
                              {file.path}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-8 py-3 text-xs text-text-muted">No files in this commit</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onViewDiff={() => handleViewDiff(contextMenu.hash, contextMenu.file.path)}
          onRevealInFiles={() => handleRevealInFiles(contextMenu.file.path)}
          onCopyPath={() => handleCopyPath(contextMenu.file.path)}
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
