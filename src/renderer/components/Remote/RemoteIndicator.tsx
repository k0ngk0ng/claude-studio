import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRemoteStore } from '../../stores/remoteStore';

/**
 * TopBar banner — only shows when desktop is being remote-controlled.
 * The "relay connected" status has moved to UserMenu.
 */
export function RemoteControlBanner() {
  const { t } = useTranslation();
  const { controlMode, controllingDeviceName } = useRemoteStore();

  if (controlMode !== 'remote' && controlMode !== 'unlocking') return null;

  return (
    <div className="flex items-center gap-1.5" title={t('remoteStatus.controlledBy', { device: controllingDeviceName })}>
      <div className="w-2 h-2 rounded-full bg-error animate-pulse" />
      <span className="text-xs text-error font-medium">{t('remoteControl.title')}</span>
    </div>
  );
}

/**
 * Relay connection status shown inside the UserMenu dropdown.
 */
export function RelayStatus() {
  const { t } = useTranslation();
  const { relayConnected, controlMode, controllingDeviceName, pairedDevices } = useRemoteStore();

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          relayConnected ? 'bg-success' : 'bg-text-muted'
        }`}
      />
      <div className="min-w-0">
        <div className="text-xs text-text-secondary">
          {!relayConnected
            ? t('remoteStatus.relayDisconnected')
            : controlMode === 'remote' || controlMode === 'unlocking'
              ? t('remoteStatus.controlledBy', { device: controllingDeviceName || t('common.mobile') })
              : t('remoteStatus.relayConnected')}
        </div>
        {relayConnected && pairedDevices.length > 0 && controlMode === 'local' && (
          <div className="text-[10px] text-text-muted">
            {t('remoteStatus.pairedDevices', { count: pairedDevices.length })}
          </div>
        )}
      </div>
    </div>
  );
}
