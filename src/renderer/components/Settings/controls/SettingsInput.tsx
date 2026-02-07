import React from 'react';

interface SettingsInputProps {
  label: string;
  description: string;
  type: 'text' | 'number';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}

export function SettingsInput({
  label,
  description,
  type,
  value,
  onChange,
  placeholder,
  min,
  max,
}: SettingsInputProps) {
  return (
    <div>
      <div className="text-sm font-medium text-text-primary mb-0.5">{label}</div>
      <div className="text-xs text-text-muted mb-2">{description}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm
                   text-text-primary focus:outline-none focus:border-accent
                   placeholder:text-text-muted"
      />
    </div>
  );
}
