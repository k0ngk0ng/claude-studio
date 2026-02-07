import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';

interface Attachment {
  name: string;
  path: string;
  type: 'image';
  preview?: string; // data URL for image preview
}

type ClaudeMode = 'ask' | 'auto-edit' | 'full-auto' | 'plan';

const MODE_OPTIONS: { value: ClaudeMode; label: string; description: string }[] = [
  { value: 'ask', label: 'Ask before edits', description: 'Claude asks permission before making changes' },
  { value: 'auto-edit', label: 'Edit automatically', description: 'Claude edits files without asking' },
  { value: 'full-auto', label: 'Bypass permissions', description: 'Full autonomy, no permission prompts' },
  { value: 'plan', label: 'Plan mode', description: 'Claude creates a plan before executing' },
];

interface InputBarProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function InputBar({ onSend, isStreaming, onStop }: InputBarProps) {
  const { currentProject, setBranch } = useAppStore();
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<ClaudeMode>('ask');
  const [modeOpen, setModeOpen] = useState(false);
  const [modelName, setModelName] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  // Load model name from backend
  useEffect(() => {
    window.api.app.getModel().then((model) => {
      setModelName(model);
    }).catch(() => {
      setModelName('claude-sonnet-4-20250514');
    });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
  }, [value]);

  // Listen for suggestion card selections
  useEffect(() => {
    function handleSuggestion(e: Event) {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      setValue(customEvent.detail.prompt);
      textareaRef.current?.focus();
    }

    window.addEventListener('suggestion-selected', handleSuggestion);
    return () =>
      window.removeEventListener('suggestion-selected', handleSuggestion);
  }, []);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
        setShowNewBranch(false);
        setNewBranchName('');
      }
    }
    if (modeOpen || branchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [modeOpen, branchOpen]);

  // Focus new branch input when shown
  useEffect(() => {
    if (showNewBranch) {
      newBranchInputRef.current?.focus();
    }
  }, [showNewBranch]);

  // Load branches when dropdown opens
  const loadBranches = useCallback(async () => {
    if (!currentProject.path) return;
    try {
      const list = await window.api.git.listBranches(currentProject.path);
      setBranches(list);
    } catch {
      setBranches([]);
    }
  }, [currentProject.path]);

  const handleBranchToggle = useCallback(() => {
    if (!branchOpen) {
      loadBranches();
    } else {
      setShowNewBranch(false);
      setNewBranchName('');
    }
    setBranchOpen(!branchOpen);
  }, [branchOpen, loadBranches]);

  const handleCheckout = useCallback(async (branchName: string) => {
    if (!currentProject.path) return;
    try {
      await window.api.git.checkout(currentProject.path, branchName);
      setBranch(branchName);
      setBranchOpen(false);
    } catch (err) {
      console.error('Checkout failed:', err);
    }
  }, [currentProject.path, setBranch]);

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name || !currentProject.path) return;
    try {
      await window.api.git.createBranch(currentProject.path, name);
      setBranch(name);
      setBranchOpen(false);
      setShowNewBranch(false);
      setNewBranchName('');
    } catch (err) {
      console.error('Create branch failed:', err);
    }
  }, [newBranchName, currentProject.path, setBranch]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    // Build message with attachment references
    let message = trimmed;
    if (attachments.length > 0) {
      const filePaths = attachments.map((a) => a.path).join('\n');
      message = message
        ? `${message}\n\n[Attached files:\n${filePaths}]`
        : `[Attached files:\n${filePaths}]`;
    }

    onSend(message);
    setValue('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, attachments, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleAddFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            path: (file as any).path || file.name,
            type: 'image',
            preview: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const currentMode = MODE_OPTIONS.find((m) => m.value === mode)!;

  // Format model name for display (e.g. "claude-opus" → "Opus")
  const displayModel = modelName
    .replace(/^claude-?/i, '')
    .replace(/-(\d{8})$/, '') // remove date suffix like -20250514
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ') || modelName;

  return (
    <div className="shrink-0 bg-bg px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex flex-col bg-surface rounded-xl border border-border focus-within:border-border-light transition-colors">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex gap-2 px-3 pt-3 flex-wrap">
              {attachments.map((att, index) => (
                <div
                  key={index}
                  className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border bg-bg"
                >
                  {att.preview && (
                    <img
                      src={att.preview}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-surface-active
                               text-text-primary flex items-center justify-center
                               opacity-0 group-hover:opacity-100 transition-opacity
                               shadow-md text-xs"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[9px] text-white truncate block">
                      {att.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Textarea — on top */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything, @ to add files, / for commands"
            disabled={isStreaming}
            rows={2}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted
                       px-3 py-2.5 resize-none outline-none min-h-[64px] max-h-[300px]
                       disabled:opacity-50"
          />

          {/* Toolbar row — below textarea */}
          <div className="flex items-center gap-1 px-2 pb-2">
            {/* Add file button */}
            <button
              onClick={handleAddFile}
              disabled={isStreaming}
              className="flex items-center justify-center w-8 h-8 rounded-lg
                         text-text-muted hover:text-text-primary hover:bg-surface-hover
                         disabled:opacity-30 transition-colors"
              title="Add image"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Mode selector dropdown */}
            <div className="relative" ref={modeDropdownRef}>
              <button
                onClick={() => setModeOpen(!modeOpen)}
                disabled={isStreaming}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs
                           text-text-secondary hover:text-text-primary hover:bg-surface-hover
                           disabled:opacity-30 transition-colors"
                title={currentMode.description}
              >
                {/* Mode icon */}
                {mode === 'ask' && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M6.5 6a1.5 1.5 0 113 0c0 .83-.68 1.1-1.5 1.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                  </svg>
                )}
                {mode === 'auto-edit' && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    <path d="M9.5 3.5l3 3" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
                {mode === 'full-auto' && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l2 4.5L15 7l-5 1.5L8 13l-2-4.5L1 7l5-1.5L8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                )}
                {mode === 'plan' && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4h8M4 8h8M4 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                )}
                <span>{currentMode.label}</span>
                {/* Chevron */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${modeOpen ? 'rotate-180' : ''}`}>
                  <path d="M2.5 3.5L5 6.5l2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Mode dropdown menu */}
              {modeOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-surface border border-border
                                rounded-lg shadow-lg py-1 z-50">
                  {MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setMode(opt.value);
                        setModeOpen(false);
                      }}
                      className={`flex flex-col w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors
                                  ${mode === opt.value ? 'bg-surface-hover' : ''}`}
                    >
                      <span className={`text-xs font-medium ${mode === opt.value ? 'text-accent' : 'text-text-primary'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-text-muted mt-0.5">
                        {opt.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Model name display */}
            {modelName && (
              <div className="flex items-center gap-1.5 px-2 h-8 text-[11px] text-text-muted" title={modelName}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-60">
                  <path d="M8 1.5a2.5 2.5 0 012.5 2.5v1h-5V4A2.5 2.5 0 018 1.5z" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="2" y="5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="8" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 11v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="truncate max-w-[140px]">{displayModel}</span>
              </div>
            )}

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex items-center justify-center w-8 h-8 rounded-lg
                           bg-error/20 text-error hover:bg-error/30 transition-colors"
                title="Stop generation"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="3"
                    y="3"
                    width="8"
                    height="8"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!value.trim() && attachments.length === 0}
                className="flex items-center justify-center w-8 h-8 rounded-lg
                           bg-accent text-white hover:bg-accent-hover
                           disabled:opacity-30 disabled:cursor-not-allowed
                           transition-colors"
                title="Send message (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 12V2M7 2l-4 4M7 2l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Bottom hint row */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[11px] text-text-muted">
            {value.length > 0 ? `${value.length} chars • ` : ''}Shift+Enter for new line
          </span>

          {/* Git branch switcher */}
          {currentProject.branch && (
            <div className="relative" ref={branchDropdownRef}>
              <button
                onClick={handleBranchToggle}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted
                           hover:text-text-primary hover:bg-surface-hover transition-colors"
                title="Switch branch"
              >
                {/* Git branch icon */}
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="11" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5 5.5v5M5 7c0-1 1.5-1.5 4.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="font-mono">{currentProject.branch}</span>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className={`transition-transform ${branchOpen ? 'rotate-180' : ''}`}>
                  <path d="M2.5 3.5L5 6.5l2.5-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Branch dropdown */}
              {branchOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-64 bg-surface border border-border
                                rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-text-secondary">Checkout branch</span>
                  </div>

                  <div className="max-h-[240px] overflow-y-auto py-1">
                    {branches.map((b) => (
                      <button
                        key={b.name}
                        onClick={() => handleCheckout(b.name)}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                                    hover:bg-surface-hover transition-colors
                                    ${b.current ? 'text-text-primary' : 'text-text-secondary'}`}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 opacity-50">
                          <circle cx="5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <circle cx="11" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M5 5.5v5M5 7c0-1 1.5-1.5 4.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span className="font-mono truncate flex-1">{b.name}</span>
                        {b.current && (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 text-accent">
                            <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Create new branch */}
                  <div className="border-t border-border">
                    {!showNewBranch ? (
                      <button
                        onClick={() => setShowNewBranch(true)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                                   text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                        <span>Create and checkout new branch…</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-2">
                        <input
                          ref={newBranchInputRef}
                          type="text"
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateBranch();
                            if (e.key === 'Escape') {
                              setShowNewBranch(false);
                              setNewBranchName('');
                            }
                          }}
                          placeholder="new-branch-name"
                          className="flex-1 bg-bg border border-border rounded px-2 py-1 text-xs
                                     text-text-primary placeholder-text-muted outline-none
                                     focus:border-accent"
                        />
                        <button
                          onClick={handleCreateBranch}
                          disabled={!newBranchName.trim()}
                          className="px-2 py-1 rounded text-xs bg-accent text-white
                                     hover:bg-accent-hover disabled:opacity-30 transition-colors"
                        >
                          Create
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
