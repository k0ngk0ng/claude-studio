import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsSelect } from './controls/SettingsSelect';
import { SettingsTagInput } from './controls/SettingsTagInput';

export function PermissionsSection() {
  const { t } = useTranslation();
  const { settings, updateGeneral, updatePermissions } = useSettingsStore();
  const { general, permissions } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">{t('permissions.title')}</h2>
      <p className="text-sm text-text-muted mb-6">
        {t('permissions.description')}
      </p>

      <div className="space-y-6">
        {/* Permission mode */}
        <SettingsSelect
          label={t('permissions.permissionMode')}
          description={t('permissions.permissionModeDesc')}
          value={general.autoApprove}
          onChange={(v) => updateGeneral({ autoApprove: v as any })}
          options={[
            { value: 'acceptEdits', label: t('permissions.acceptEdits') },
            { value: 'bypassPermissions', label: t('permissions.bypassPermissions') },
            { value: 'plan', label: t('permissions.plan') },
            { value: 'dontAsk', label: t('permissions.dontAsk') },
          ]}
        />

        {/* Divider */}
        <div className="border-t border-border pt-2" />

        {/* File read */}
        <SettingsToggle
          label={t('permissions.allowFileRead')}
          description={t('permissions.allowFileReadDesc')}
          checked={permissions.allowFileRead}
          onChange={(v) => updatePermissions({ allowFileRead: v })}
        />

        {/* File write */}
        <SettingsToggle
          label={t('permissions.allowFileWrite')}
          description={t('permissions.allowFileWriteDesc')}
          checked={permissions.allowFileWrite}
          onChange={(v) => updatePermissions({ allowFileWrite: v })}
        />

        {/* Bash */}
        <SettingsToggle
          label={t('permissions.allowBash')}
          description={t('permissions.allowBashDesc')}
          checked={permissions.allowBash}
          onChange={(v) => updatePermissions({ allowBash: v })}
        />

        {/* MCP */}
        <SettingsToggle
          label={t('permissions.allowMcp')}
          description={t('permissions.allowMcpDesc')}
          checked={permissions.allowMcp}
          onChange={(v) => updatePermissions({ allowMcp: v })}
        />

        {/* Disallowed commands */}
        <SettingsTagInput
          label={t('permissions.disallowedCommands')}
          description={t('permissions.disallowedCommandsDesc')}
          tags={permissions.disallowedCommands}
          onChange={(tags) => updatePermissions({ disallowedCommands: tags })}
          placeholder={t('permissions.addCommand')}
        />
      </div>
    </div>
  );
}
