import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CommandInfo } from '../../types';

// ─── Built-in Claude Code commands ──────────────────────────────────
export interface SlashItem {
  name: string;
  description: string;
  argumentHint: string;
  source: 'builtin' | 'custom';
  type?: 'md' | 'sh';
  local?: boolean; // handled locally in GUI, not sent to SDK
}

/** Commands handled entirely in the GUI */
export const LOCAL_COMMANDS = new Set(['clear', 'config', 'help']);

export const BUILTIN_COMMANDS: SlashItem[] = [
  { name: 'add-dir', description: 'Add additional directories to the current session context', argumentHint: '<directory>', source: 'builtin' },
  { name: 'bug', description: 'Report bugs in Claude Code (creates GitHub issue)', argumentHint: '[description]', source: 'builtin' },
  { name: 'clear', description: 'Clear conversation history and free up context', argumentHint: '', source: 'builtin', local: true },
  { name: 'compact', description: 'Compact conversation to save context space', argumentHint: '[instructions]', source: 'builtin' },
  { name: 'config', description: 'Open settings', argumentHint: '', source: 'builtin', local: true },
  { name: 'context', description: 'Manage context files and directories for the session', argumentHint: '', source: 'builtin' },
  { name: 'cost', description: 'Show token usage and cost for this session', argumentHint: '', source: 'builtin' },
  { name: 'doctor', description: 'Check the health of your Claude Code installation', argumentHint: '', source: 'builtin' },
  { name: 'help', description: 'Show available commands and usage information', argumentHint: '', source: 'builtin', local: true },
  { name: 'init', description: 'Initialize a new CLAUDE.md project guide', argumentHint: '', source: 'builtin' },
  { name: 'login', description: 'Switch accounts or re-authenticate', argumentHint: '', source: 'builtin' },
  { name: 'logout', description: 'Sign out of your current account', argumentHint: '', source: 'builtin' },
  { name: 'memory', description: 'Edit CLAUDE.md memory files', argumentHint: '', source: 'builtin' },
  { name: 'model', description: 'Switch or display the current AI model', argumentHint: '[model-name]', source: 'builtin' },
  { name: 'permissions', description: 'View or update tool permissions', argumentHint: '', source: 'builtin' },
  { name: 'review', description: 'Review a pull request or set of changes', argumentHint: '[pr-url]', source: 'builtin' },
  { name: 'status', description: 'Show current session status and configuration', argumentHint: '', source: 'builtin' },
  { name: 'terminal-setup', description: 'Install Shift+Enter key binding for newlines', argumentHint: '', source: 'builtin' },
  { name: 'vim', description: 'Enter vim mode for keyboard-driven editing', argumentHint: '', source: 'builtin' },
];

// ─── Component ──────────────────────────────────────────────────────

interface SlashCommandPopupProps {
  query: string;
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function SlashCommandPopup({
  query,
  visible,
  onSelect,
  onClose,
}: SlashCommandPopupProps) {
  const [allItems, setAllItems] = useState<SlashItem[]>([]);
  const [filtered, setFiltered] = useState<SlashItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load custom commands and merge with builtins when popup becomes visible
  useEffect(() => {
    if (!visible) return;
    window.api.commands.list().then((customCmds: CommandInfo[]) => {
      const customItems: SlashItem[] = customCmds.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.argumentHint,
        source: 'custom' as const,
        type: c.type,
      }));
      // Custom commands first, then builtins (skip builtins that are overridden)
      const customNames = new Set(customItems.map((c) => c.name));
      const builtins = BUILTIN_COMMANDS.filter((b) => !customNames.has(b.name));
      setAllItems([...customItems, ...builtins]);
    }).catch(() => {
      setAllItems([...BUILTIN_COMMANDS]);
    });
  }, [visible]);

  // Filter by query
  useEffect(() => {
    if (!query) {
      setFiltered(allItems);
    } else {
      const q = query.toLowerCase();
      setFiltered(allItems.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      ));
    }
    setSelectedIndex(0);
  }, [query, allItems]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[selectedIndex].name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[selectedIndex].name);
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border
                 rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M4.5 6l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 10h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span>Slash commands</span>
        </div>
      </div>

      {/* Command list */}
      <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-text-muted">
            No commands matching "/{query}"
          </div>
        )}

        {filtered.map((cmd, index) => (
          <button
            key={`${cmd.source}-${cmd.name}`}
            onClick={() => onSelect(cmd.name)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`flex items-center gap-3 w-full px-3 py-1.5 text-left transition-colors
                        ${index === selectedIndex ? 'bg-surface-hover' : ''}`}
          >
            {/* Source badge */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
              cmd.local
                ? 'bg-success/10 text-success'
                : cmd.source === 'builtin'
                  ? 'bg-info/10 text-info'
                  : cmd.type === 'sh'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-accent/10 text-accent'
            }`}>
              {cmd.local ? 'local' : cmd.source === 'builtin' ? 'built-in' : `.${cmd.type}`}
            </span>

            {/* Name + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-text-primary">/{cmd.name}</span>
                {cmd.argumentHint && (
                  <span className="text-[10px] text-text-muted">{cmd.argumentHint}</span>
                )}
              </div>
              {cmd.description && (
                <div className="text-[10px] text-text-muted truncate mt-0.5">
                  {cmd.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
