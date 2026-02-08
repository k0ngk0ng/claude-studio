import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsSelect } from './controls/SettingsSelect';

export function GeneralSection() {
  const { settings, updateGeneral } = useSettingsStore();
  const { general } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">General</h2>
      <p className="text-sm text-text-muted mb-6">
        Configure general behavior and preferences.
      </p>

      <div className="space-y-6">
        {/* Send key */}
        <SettingsSelect
          label="Send message with"
          description="Choose the key combination to send messages."
          value={general.sendKey}
          onChange={(v) => updateGeneral({ sendKey: v as 'enter' | 'cmd-enter' })}
          options={[
            { value: 'enter', label: 'Enter' },
            { value: 'cmd-enter', label: '⌘ Enter' },
          ]}
        />

        {/* Permission mode */}
        <SettingsSelect
          label="Permission mode"
          description="Control how Claude handles tool permissions. This sets the default for new sessions."
          value={general.autoApprove}
          onChange={(v) => updateGeneral({ autoApprove: v as any })}
          options={[
            { value: 'acceptEdits', label: 'Accept edits — Auto-approve file edits' },
            { value: 'bypassPermissions', label: 'Bypass permissions — Skip all prompts (⚠️ unsafe)' },
            { value: 'plan', label: 'Plan mode — Analyze only, no modifications' },
            { value: 'dontAsk', label: "Don't ask — Auto-deny unless pre-approved" },
          ]}
        />

        {/* Show cost info */}
        <SettingsToggle
          label="Show cost information"
          description="Display token usage and estimated cost for each response."
          checked={general.showCostInfo}
          onChange={(v) => updateGeneral({ showCostInfo: v })}
        />

        {/* Notify on complete */}
        <SettingsToggle
          label="Notify on completion"
          description="Show a system notification when a long-running task completes."
          checked={general.notifyOnComplete}
          onChange={(v) => updateGeneral({ notifyOnComplete: v })}
        />

        {/* Prevent sleep */}
        <SettingsToggle
          label="Prevent system sleep"
          description="Keep the system awake while Claude is processing a task."
          checked={general.preventSleep}
          onChange={(v) => updateGeneral({ preventSleep: v })}
        />

        {/* Divider */}
        <div className="border-t border-border pt-2" />

        {/* Debug mode */}
        <SettingsToggle
          label="Debug mode"
          description="Enable DevTools (⌘⌥I / F12), show Debug Logs tab in the bottom panel, and log all Claude CLI communication details for troubleshooting."
          checked={general.debugMode}
          onChange={(v) => updateGeneral({ debugMode: v })}
        />
      </div>
    </div>
  );
}
