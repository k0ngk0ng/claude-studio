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

        {/* Auto-approve level */}
        <SettingsSelect
          label="Autonomy level"
          description="Control how much Claude can do without asking for permission."
          value={general.autoApprove}
          onChange={(v) => updateGeneral({ autoApprove: v as 'suggest' | 'auto-edit' | 'full-auto' })}
          options={[
            { value: 'suggest', label: 'Suggest — Ask before every action' },
            { value: 'auto-edit', label: 'Auto-edit — Auto-approve file edits' },
            { value: 'full-auto', label: 'Full auto — Auto-approve all actions' },
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
      </div>
    </div>
  );
}
