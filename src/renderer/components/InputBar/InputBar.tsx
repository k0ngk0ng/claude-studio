import React, { useState, useRef, useEffect, useCallback } from 'react';

interface InputBarProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function InputBar({ onSend, isStreaming, onStop }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
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

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="shrink-0 border-t border-border bg-bg px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-surface rounded-xl border border-border focus-within:border-border-light transition-colors">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything, @ to add files, / for commands"
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted
                       px-4 py-3 resize-none outline-none min-h-[44px] max-h-[200px]
                       disabled:opacity-50"
          />

          {/* Send / Stop button */}
          <div className="pr-2 pb-2">
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
                disabled={!value.trim()}
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

        {/* Model info */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[11px] text-text-muted">
            Claude Code • Shift+Enter for new line
          </span>
          <span className="text-[11px] text-text-muted">
            {value.length > 0 && `${value.length} chars`}
          </span>
        </div>
      </div>
    </div>
  );
}
