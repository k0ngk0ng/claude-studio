import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { SettingsNav } from './SettingsNav';
import { GeneralSection } from './GeneralSection';
import { ClaudeCodeSection } from './ClaudeCodeSection';
import { PermissionsSection } from './PermissionsSection';
import { McpServersSection } from './McpServersSection';
import { SkillsSection } from './SkillsSection';
import { CommandsSection } from './CommandsSection';
import { GitSection } from './GitSection';
import { AppearanceSection } from './AppearanceSection';
import { KeybindingsSection } from './KeybindingsSection';
import { AboutSection } from './AboutSection';

export function Settings() {
  const { activeTab, closeSettings } = useSettingsStore();
  const { platform } = useAppStore();
  const isMac = platform === 'mac';

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSection />;
      case 'claude-code':
        return <ClaudeCodeSection />;
      case 'permissions':
        return <PermissionsSection />;
      case 'skills':
        return <SkillsSection />;
      case 'commands':
        return <CommandsSection />;
      case 'mcp-servers':
        return <McpServersSection />;
      case 'git':
        return <GitSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'keybindings':
        return <KeybindingsSection />;
      case 'about':
        return <AboutSection />;
      default:
        return <GeneralSection />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* Left navigation sidebar */}
      <div className="flex flex-col w-60 min-w-60 bg-sidebar border-r border-border h-full">
        {/* Drag region for macOS traffic lights */}
        {isMac && <div className="titlebar-drag h-13 shrink-0" />}
        {!isMac && <div className="h-2 shrink-0" />}

        {/* Back button */}
        <div className="px-3 pb-3">
          <button
            onClick={closeSettings}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg
                       text-text-secondary hover:text-text-primary hover:bg-surface
                       text-sm transition-colors duration-150 titlebar-no-drag"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Back to app</span>
          </button>
        </div>

        {/* Navigation */}
        <SettingsNav />
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Drag region for macOS */}
        {isMac && <div className="titlebar-drag h-13 shrink-0" />}
        {!isMac && <div className="h-10 shrink-0" />}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
