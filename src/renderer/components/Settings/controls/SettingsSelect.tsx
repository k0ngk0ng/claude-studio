import React from 'react';

interface SettingsSelectProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function SettingsSelect({ label, description, value, onChange, options }: SettingsSelectProps) {
  return (
    <div>
      <div className="text-sm font-medium text-text-primary mb-0.5">{label}</div>
      <div className="text-xs text-text-muted mb-2">{description}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm
                   text-text-primary focus:outline-none focus:border-accent
                   appearance-none cursor-pointer
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
