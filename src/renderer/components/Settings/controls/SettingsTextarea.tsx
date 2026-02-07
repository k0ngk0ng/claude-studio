import React from 'react';

interface SettingsTextareaProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function SettingsTextarea({
  label,
  description,
  value,
  onChange,
  placeholder,
  rows = 3,
}: SettingsTextareaProps) {
  return (
    <div>
      <div className="text-sm font-medium text-text-primary mb-0.5">{label}</div>
      <div className="text-xs text-text-muted mb-2">{description}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm
                   text-text-primary focus:outline-none focus:border-accent resize-none
                   placeholder:text-text-muted font-mono"
      />
    </div>
  );
}
