import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsTagInput } from './controls/SettingsTagInput';

export function PermissionsSection() {
  const { settings, updatePermissions } = useSettingsStore();
  const { permissions } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Permissions</h2>
      <p className="text-sm text-text-muted mb-6">
        Control what Claude is allowed to do on your system.
      </p>

      <div className="space-y-6">
        {/* File read */}
        <SettingsToggle
          label="Allow file reading"
          description="Allow Claude to read files from your project directory."
          checked={permissions.allowFileRead}
          onChange={(v) => updatePermissions({ allowFileRead: v })}
        />

        {/* File write */}
        <SettingsToggle
          label="Allow file writing"
          description="Allow Claude to create and modify files in your project."
          checked={permissions.allowFileWrite}
          onChange={(v) => updatePermissions({ allowFileWrite: v })}
        />

        {/* Bash */}
        <SettingsToggle
          label="Allow bash commands"
          description="Allow Claude to execute shell commands. Disable for a read-only experience."
          checked={permissions.allowBash}
          onChange={(v) => updatePermissions({ allowBash: v })}
        />

        {/* MCP */}
        <SettingsToggle
          label="Allow MCP tool use"
          description="Allow Claude to use tools provided by MCP servers."
          checked={permissions.allowMcp}
          onChange={(v) => updatePermissions({ allowMcp: v })}
        />

        {/* Disallowed commands */}
        <SettingsTagInput
          label="Disallowed commands"
          description="Commands that Claude should never execute, even in full-auto mode."
          tags={permissions.disallowedCommands}
          onChange={(tags) => updatePermissions({ disallowedCommands: tags })}
          placeholder="Add a command..."
        />
      </div>
    </div>
  );
}
