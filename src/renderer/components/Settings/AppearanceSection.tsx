import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsSelect } from './controls/SettingsSelect';
import { SettingsInput } from './controls/SettingsInput';
import { SettingsToggle } from './controls/SettingsToggle';
import { StreamingCursor } from '../Chat/MessageBubble';
import type { StreamingCursorStyle } from '../../types';

const CURSOR_OPTIONS: { value: StreamingCursorStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'pulse-dot', label: 'Pulse Dot' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'scan-line', label: 'Scan Line' },
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'dna-helix', label: 'DNA Helix' },
  { value: 'heartbeat', label: 'Heartbeat' },
  { value: 'neon-flicker', label: 'Neon Flicker' },
];

export function AppearanceSection() {
  const { settings, updateAppearance } = useSettingsStore();
  const { appearance } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Appearance</h2>
      <p className="text-sm text-text-muted mb-6">
        Customize the look and feel of the application.
      </p>

      <div className="space-y-6">
        {/* Theme */}
        <SettingsSelect
          label="Theme"
          description="Choose the color theme for the application."
          value={appearance.theme}
          onChange={(v) => updateAppearance({ theme: v as 'dark' | 'light' | 'system' })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />

        {/* Opaque background */}
        <SettingsToggle
          label="Opaque background"
          description="Use a fully opaque background instead of translucent effects."
          checked={appearance.opaqueBackground}
          onChange={(v) => updateAppearance({ opaqueBackground: v })}
        />

        {/* Show line numbers */}
        <SettingsToggle
          label="Show line numbers"
          description="Display line numbers in code blocks and diffs."
          checked={appearance.showLineNumbers}
          onChange={(v) => updateAppearance({ showLineNumbers: v })}
        />

        {/* Chat layout */}
        <SettingsSelect
          label="Chat layout"
          description="Centered keeps messages in a fixed-width column. Full width uses all available space."
          value={appearance.chatLayout}
          onChange={(v) => updateAppearance({ chatLayout: v as 'centered' | 'full-width' })}
          options={[
            { value: 'centered', label: 'Centered (768px)' },
            { value: 'full-width', label: 'Full width' },
          ]}
        />

        {/* Streaming cursor style */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-sm font-medium text-text-primary">Streaming cursor</div>
              <div className="text-xs text-text-muted mt-0.5">Choose the animation style shown while AI is responding.</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {CURSOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateAppearance({ streamingCursor: opt.value })}
                className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-all ${
                  appearance.streamingCursor === opt.value
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface hover:border-text-muted'
                }`}
              >
                <div className="h-6 flex items-center justify-center text-[14px]">
                  <StreamingCursor style={opt.value} />
                </div>
                <span className="text-xs text-text-primary font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* UI Font size */}
        <SettingsInput
          label="UI font size"
          description="Font size for the application interface (in pixels)."
          type="number"
          value={appearance.fontSize.toString()}
          onChange={(v) => updateAppearance({ fontSize: parseInt(v) || 14 })}
          min={10}
          max={24}
        />

        {/* UI Font family */}
        <SettingsInput
          label="UI font family"
          description="Font family for the application interface."
          type="text"
          value={appearance.fontFamily}
          onChange={(v) => updateAppearance({ fontFamily: v })}
        />

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Editor font size */}
        <SettingsInput
          label="Editor / code font size"
          description="Font size for code blocks, terminal, and diffs (in pixels)."
          type="number"
          value={appearance.editorFontSize.toString()}
          onChange={(v) => updateAppearance({ editorFontSize: parseInt(v) || 13 })}
          min={8}
          max={24}
        />

        {/* Editor font family */}
        <SettingsInput
          label="Editor / code font family"
          description="Monospace font for code blocks, terminal, and diffs."
          type="text"
          value={appearance.editorFontFamily}
          onChange={(v) => updateAppearance({ editorFontFamily: v })}
        />
      </div>
    </div>
  );
}
