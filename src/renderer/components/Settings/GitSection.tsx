import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsInput } from './controls/SettingsInput';

export function GitSection() {
  const { settings, updateGit } = useSettingsStore();
  const { git } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Git</h2>
      <p className="text-sm text-text-muted mb-6">
        Configure git integration behavior.
      </p>

      <div className="space-y-6">
        {/* Auto stage */}
        <SettingsToggle
          label="Auto-stage changes"
          description="Automatically stage file changes made by Claude."
          checked={git.autoStage}
          onChange={(v) => updateGit({ autoStage: v })}
        />

        {/* Show diff on commit */}
        <SettingsToggle
          label="Show diff before commit"
          description="Open the diff panel automatically when committing changes."
          checked={git.showDiffOnCommit}
          onChange={(v) => updateGit({ showDiffOnCommit: v })}
        />

        {/* Auto push */}
        <SettingsToggle
          label="Auto-push after commit"
          description="Automatically push to remote after each commit."
          checked={git.autoPush}
          onChange={(v) => updateGit({ autoPush: v })}
        />

        {/* Default commit prefix */}
        <SettingsInput
          label="Default commit prefix"
          description="A prefix added to all commit messages (e.g., 'feat:', 'fix:', '[claude]')."
          type="text"
          value={git.defaultCommitPrefix}
          onChange={(v) => updateGit({ defaultCommitPrefix: v })}
          placeholder="e.g., [claude]"
        />
      </div>
    </div>
  );
}
