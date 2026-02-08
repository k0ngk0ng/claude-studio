import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { SettingsTab } from '../../types';

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M13.5 8a5.5 5.5 0 01-.44 2.16l1.13.65-.75 1.3-1.13-.65A5.5 5.5 0 018 13.5v1.3h-1.5v-1.3a5.5 5.5 0 01-3.81-2.04l-1.13.65-.75-1.3 1.13-.65A5.5 5.5 0 012.5 8c0-.76.16-1.48.44-2.16l-1.13-.65.75-1.3 1.13.65A5.5 5.5 0 018 2.5V1.2h1.5v1.3a5.5 5.5 0 013.81 2.04l1.13-.65.75 1.3-1.13.65c.28.68.44 1.4.44 2.16z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
  },
  {
    id: 'provider',
    label: 'Provider',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 11.5a3.5 3.5 0 01-.5-6.96A4.5 4.5 0 018 1.5a4.5 4.5 0 014.5 3.04A3.5 3.5 0 0112 11.5H4z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6 14h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5L3 4v4c0 3.5 2.1 6.2 5 7.5 2.9-1.3 5-4 5-7.5V4L8 1.5z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6 8l1.5 1.5L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'mcp-servers',
    label: 'MCP Servers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="2" y="9" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="5" r="0.75" fill="currentColor" />
        <circle cx="4.5" cy="11" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'git',
    label: 'Git',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 5.5v5M9.5 4H6.5" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2a6 6 0 100 12 1 1 0 001-1v-.5a1 1 0 011-1h1.5A2.5 2.5 0 0014 9a6 6 0 00-6-7z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
        <circle cx="8" cy="5" r="1" fill="currentColor" />
        <circle cx="10.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'keybindings',
    label: 'Keybindings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="4" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4 7h1M7.5 7h1M11 7h1M5 9.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function SettingsNav() {
  const { activeTab, setActiveTab } = useSettingsStore();

  return (
    <nav className="flex-1 overflow-y-auto px-3">
      <div className="space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm
                        transition-colors duration-150 titlebar-no-drag
                        ${
                          activeTab === item.id
                            ? 'bg-surface text-text-primary'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                        }`}
          >
            <span className="shrink-0 opacity-80">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
