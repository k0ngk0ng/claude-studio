import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsToggle } from './controls/SettingsToggle';
import { SettingsSelect } from './controls/SettingsSelect';
import { supportedLanguages, changeLanguage } from '../../i18n';

export function GeneralSection() {
  const { t } = useTranslation();
  const { settings, updateGeneral } = useSettingsStore();
  const { general } = settings;

  const handleUiLanguageChange = (v: string) => {
    updateGeneral({ uiLanguage: v });
    changeLanguage(v);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">{t('settings.general')}</h2>
      <p className="text-sm text-text-muted mb-6">
        {t('general.configureDesc')}
      </p>

      <div className="space-y-6">
        {/* UI Language */}
        <SettingsSelect
          label={t('general.uiLanguage')}
          description={t('general.uiLanguageDesc')}
          value={general.uiLanguage}
          onChange={handleUiLanguageChange}
          options={supportedLanguages.map(lang => ({
            value: lang.code,
            label: lang.nativeName,
          }))}
        />

        {/* Response Language */}
        <SettingsSelect
          label={t('general.responseLanguage')}
          description={t('general.responseLanguageDesc')}
          value={general.language}
          onChange={(v) => updateGeneral({ language: v })}
          options={[
            { value: 'auto', label: t('general.autoFollowInput') },
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

        {/* Notify on complete */}
        <SettingsToggle
          label={t('general.notifyOnComplete')}
          description={t('general.notifyOnCompleteDesc')}
          checked={general.notifyOnComplete}
          onChange={(v) => updateGeneral({ notifyOnComplete: v })}
        />

        {/* Prevent sleep */}
        <SettingsToggle
          label={t('general.preventSleep')}
          description={t('general.preventSleepDesc')}
          checked={general.preventSleep}
          onChange={(v) => {
            updateGeneral({ preventSleep: v });
            window.api.app.preventSleep(v);
          }}
        />

        {/* Divider */}
        <div className="border-t border-border pt-2" />

        {/* Debug mode */}
        <SettingsToggle
          label={t('general.debugMode')}
          description={t('general.debugModeDesc')}
          checked={general.debugMode}
          onChange={(v) => updateGeneral({ debugMode: v })}
        />

      </div>
    </div>
  );
}
