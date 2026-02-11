import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';

export function TopBar() {
  const { currentSession, currentProject, panels, togglePanel, platform, gitStatus } =
    useAppStore();

  const isMac = platform === 'mac';
  const threadTitle = currentSession.title || 'Thread';
  const title = currentSession.id
    ? `${currentProject.name} — ${threadTitle}`
    : currentProject.name || 'ClaudeStudio';

  const isBottomOpen = panels.terminal || panels.logs;

  const handleToggleBottom = () => {
    // If any bottom panel is open, close all; otherwise open terminal
    if (isBottomOpen) {
      if (panels.terminal) togglePanel('terminal');
      if (panels.logs) togglePanel('logs');
    } else {
      togglePanel('terminal');
    }
  };

  return (
    <div
      className={`
        flex items-center justify-between px-4 h-12 shrink-0
        bg-bg titlebar-drag
        ${isMac && !panels.sidebar ? 'pl-20' : ''}
      `}
    >
      {/* Left: title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Title */}
        <h1 className="text-sm font-medium text-text-primary truncate">
          {title}
        </h1>

        {currentSession.isStreaming && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-text-muted">Thinking…</span>
          </div>
        )}
      </div>

      {/* Right: action buttons + panel toggles */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        {/* Open button */}
        <OpenButton />

        {/* Commit button */}
        <CommitButton />

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-0.5" />

        {/* VSCode-style panel toggle buttons */}
        {/* Left sidebar toggle */}
        <button
          onClick={() => togglePanel('sidebar')}
          className={`p-1.5 rounded-md transition-colors ${
            panels.sidebar
              ? 'bg-accent-muted text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
          title="Toggle sidebar (⌘B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <rect
              x="1.5" y="2.5" width="4" height="11" rx="0"
              fill={panels.sidebar ? 'currentColor' : 'none'}
              fillOpacity={panels.sidebar ? 0.25 : 0}
              stroke="none"
            />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        {/* Bottom panel toggle */}
        <button
          onClick={handleToggleBottom}
          className={`p-1.5 rounded-md transition-colors ${
            isBottomOpen
              ? 'bg-accent-muted text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
          title="Toggle bottom panel (⌘T)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <rect
              x="1.5" y="9.5" width="13" height="4" rx="0"
              fill={isBottomOpen ? 'currentColor' : 'none'}
              fillOpacity={isBottomOpen ? 0.25 : 0}
              stroke="none"
            />
            <line x1="1.5" y1="9.5" x2="14.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        {/* Right panel toggle */}
        <button
          onClick={() => togglePanel('diff')}
          className={`p-1.5 rounded-md transition-colors ${
            panels.diff
              ? 'bg-accent-muted text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
          title="Toggle right panel (⌘D)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <rect
              x="10.5" y="2.5" width="4" height="11" rx="0"
              fill={panels.diff ? 'currentColor' : 'none'}
              fillOpacity={panels.diff ? 0.25 : 0}
              stroke="none"
            />
            <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Open Button with Dropdown ──────────────────────────────────────

function OpenButton() {
  const { currentProject } = useAppStore();
  const [open, setOpen] = useState(false);
  const [editors, setEditors] = useState<{ id: string; name: string }[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      window.api.app.getAvailableEditors().then(setEditors).catch(() => {});
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = async (editorId: string) => {
    setOpen(false);
    const cwd = currentProject.path;
    if (!cwd) return;
    await window.api.app.openInEditor(cwd, editorId);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors text-xs font-medium"
      >
        {/* External link icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M9 2h5v5M14 2L7 9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Open</span>
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border
                        rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          {editors.map((editor) => (
            <button
              key={editor.id}
              onClick={() => handleOpen(editor.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors"
            >
              <EditorIcon id={editor.id} />
              <span>{editor.name}</span>
            </button>
          ))}
          {editors.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Loading…</div>
          )}
        </div>
      )}
    </div>
  );
}

function EditorIcon({ id }: { id: string }) {
  switch (id) {
    case 'finder':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
          <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
            stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'terminal':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
          <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
  }
}

// ─── Commit Button with Dropdown ────────────────────────────────────

function CommitButton() {
  const { currentProject, gitStatus } = useAppStore();
  const [open, setOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stagedCount = gitStatus?.staged.length || 0;
  const unstagedCount = gitStatus?.unstaged.length || 0;
  const totalChanges = stagedCount + unstagedCount;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setStatus(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleCommit = async () => {
    if (!commitMsg.trim() || !currentProject.path) return;
    setIsCommitting(true);
    setStatus(null);
    try {
      // Stage all if nothing staged
      if (stagedCount === 0 && unstagedCount > 0) {
        // Stage all unstaged files
        for (const file of gitStatus!.unstaged) {
          await window.api.git.stage(currentProject.path, file.path);
        }
      }
      const result = await window.api.git.commit(currentProject.path, commitMsg.trim());
      setCommitMsg('');
      setStatus('Committed!');
      // Refresh git status
      setTimeout(() => setStatus(null), 2000);
    } catch (err: any) {
      setStatus(`Error: ${err.message || 'Commit failed'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMsg.trim() || !currentProject.path) return;
    setIsCommitting(true);
    setStatus(null);
    try {
      // Stage all if nothing staged
      if (stagedCount === 0 && unstagedCount > 0) {
        for (const file of gitStatus!.unstaged) {
          await window.api.git.stage(currentProject.path, file.path);
        }
      }
      await window.api.git.commit(currentProject.path, commitMsg.trim());
      setIsPushing(true);
      await window.api.git.push(currentProject.path);
      setCommitMsg('');
      setStatus('Committed & pushed!');
      setTimeout(() => setStatus(null), 2000);
    } catch (err: any) {
      setStatus(`Error: ${err.message || 'Failed'}`);
    } finally {
      setIsCommitting(false);
      setIsPushing(false);
    }
  };

  const handlePush = async () => {
    if (!currentProject.path) return;
    setIsPushing(true);
    setStatus(null);
    try {
      await window.api.git.push(currentProject.path);
      setStatus('Pushed!');
      setTimeout(() => setStatus(null), 2000);
    } catch (err: any) {
      setStatus(`Error: ${err.message || 'Push failed'}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushTags = async () => {
    if (!currentProject.path) return;
    setIsPushing(true);
    setStatus(null);
    try {
      await window.api.git.pushTags(currentProject.path);
      setStatus('Tags pushed!');
      setTimeout(() => setStatus(null), 2000);
    } catch (err: any) {
      setStatus(`Error: ${err.message || 'Push tags failed'}`);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors text-xs font-medium"
      >
        {/* Git commit icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 1v4M8 11v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span>Commit</span>
        {totalChanges > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-medium">
            {totalChanges}
          </span>
        )}
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-surface border border-border
                        rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Commit message input */}
          <div className="p-3 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
              placeholder="Commit message…"
              className="w-full bg-bg border border-border rounded-md px-2.5 py-1.5
                         text-xs text-text-primary placeholder-text-muted
                         outline-none focus:border-accent/50"
            />
            {/* Status message */}
            {status && (
              <div className={`mt-1.5 text-[10px] ${status.startsWith('Error') ? 'text-error' : 'text-success'}`}>
                {status}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || isCommitting}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 1v4M8 11v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span>{isCommitting && !isPushing ? 'Committing…' : 'Commit'}</span>
              {stagedCount === 0 && unstagedCount > 0 && (
                <span className="text-[10px] text-text-muted ml-auto">will stage all</span>
              )}
            </button>

            <button
              onClick={handleCommitAndPush}
              disabled={!commitMsg.trim() || isCommitting}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 1v4M8 11v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M12 5l2-2-2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{isCommitting && isPushing ? 'Pushing…' : 'Commit & Push'}</span>
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={handlePush}
              disabled={isPushing}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                <path d="M8 12V3M5 5.5L8 2.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span>{isPushing && !isCommitting ? 'Pushing…' : 'Push'}</span>
            </button>

            <button
              onClick={handlePushTags}
              disabled={isPushing}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                <path d="M8 12V3M5 5.5L8 2.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span>{isPushing && !isCommitting ? 'Pushing…' : 'Push Tags'}</span>
            </button>
          </div>

          {/* Change summary */}
          {totalChanges > 0 && (
            <div className="px-3 py-2 border-t border-border text-[10px] text-text-muted">
              {stagedCount > 0 && <span>{stagedCount} staged</span>}
              {stagedCount > 0 && unstagedCount > 0 && <span> · </span>}
              {unstagedCount > 0 && <span>{unstagedCount} unstaged</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
