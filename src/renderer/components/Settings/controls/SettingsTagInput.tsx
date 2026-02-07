import React, { useState, useCallback } from 'react';

interface SettingsTagInputProps {
  label: string;
  description: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function SettingsTagInput({
  label,
  description,
  tags,
  onChange,
  placeholder = 'Add...',
}: SettingsTagInputProps) {
  const [input, setInput] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && input.trim()) {
        e.preventDefault();
        if (!tags.includes(input.trim())) {
          onChange([...tags, input.trim()]);
        }
        setInput('');
      } else if (e.key === 'Backspace' && !input && tags.length > 0) {
        onChange(tags.slice(0, -1));
      }
    },
    [input, tags, onChange]
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange]
  );

  return (
    <div>
      <div className="text-sm font-medium text-text-primary mb-0.5">{label}</div>
      <div className="text-xs text-text-muted mb-2">{description}</div>
      <div
        className="flex flex-wrap gap-1.5 p-2 bg-surface border border-border rounded-lg
                    min-h-[42px] focus-within:border-accent transition-colors"
      >
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-hover
                       rounded text-xs text-text-primary font-mono"
          >
            {tag}
            <button
              onClick={() => removeTag(index)}
              className="text-text-muted hover:text-text-primary ml-0.5"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] bg-transparent text-sm text-text-primary
                     focus:outline-none placeholder:text-text-muted"
        />
      </div>
    </div>
  );
}
