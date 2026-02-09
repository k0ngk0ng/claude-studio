import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsSelect } from './controls/SettingsSelect';

export function GeneralSection() {
  const { settings, updateGeneral } = useSettingsStore();
  const { general } = settings;
  const [version, setVersion] = useState('');
  const [sdkVersion, setSdkVersion] = useState('');

  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => {});
    window.api.app.getAgentSdkVersion().then(setSdkVersion).catch(() => {});
  }, []);

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

        {/* Language */}
        <SettingsSelect
          label="Response language"
          description="Set the language Claude uses to respond. 'Auto' follows your input language."
          value={general.language}
          onChange={(v) => updateGeneral({ language: v })}
          options={[
            { value: 'auto', label: 'Auto (follow input language)' },
            { value: 'en', label: 'English' },
            { value: 'zh-CN', label: '简体中文' },
            { value: 'zh-TW', label: '繁體中文' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
            { value: 'es', label: 'Español' },
            { value: 'fr', label: 'Français' },
            { value: 'de', label: 'Deutsch' },
            { value: 'pt', label: 'Português' },
            { value: 'ru', label: 'Русский' },
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

        {/* Version info */}
        {version && (
          <>
            <div className="border-t border-border pt-2" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Version</div>
                <div className="text-xs text-text-muted mt-0.5">Claude App</div>
              </div>
              <span className="text-sm font-mono text-text-muted">{version}</span>
            </div>
          </>
        )}

        {sdkVersion && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Agent SDK</div>
              <div className="text-xs text-text-muted mt-0.5">@anthropic-ai/claude-agent-sdk</div>
            </div>
            <span className="text-sm font-mono text-text-muted">{sdkVersion}</span>
          </div>
        )}
      </div>
    </div>
  );
}
