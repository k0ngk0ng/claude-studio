import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsInput } from './controls/SettingsInput';

export function ServerSection() {
  const { settings, updateServer } = useSettingsStore();
  const { server } = settings;
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [defaultUrl, setDefaultUrl] = useState('http://localhost:3456');
  const [effectiveUrl, setEffectiveUrl] = useState('');

  useEffect(() => {
    window.api.auth.getDefaultServerUrl().then(setDefaultUrl).catch(() => {});
    window.api.auth.getServerUrl().then(setEffectiveUrl).catch(() => {});
  }, [server.serverUrl]);

  const handleTest = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const url = effectiveUrl || defaultUrl;
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setStatus({ ok: true, message: `Connected — server v${data.version || 'unknown'}` });
      } else {
        setStatus({ ok: false, message: `Server responded with ${res.status}` });
      }
    } catch (err: any) {
      setStatus({ ok: false, message: err.message || 'Cannot reach server' });
    } finally {
      setChecking(false);
    }
  };

  const isCustom = !!server.serverUrl;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Server</h2>
      <p className="text-sm text-text-muted mb-6">
        Configure the ClaudeStudio server for authentication and data sync.
      </p>

      <div className="space-y-6">
        <SettingsInput
          label="Server URL"
          description="Override the server address. Leave empty to use the default."
          type="text"
          value={server.serverUrl}
          onChange={(v) => updateServer({ serverUrl: v })}
          placeholder={defaultUrl}
        />

        {/* Show effective URL */}
        <div className="text-xs text-text-muted -mt-3">
          Effective: <span className="font-mono text-text-secondary">{effectiveUrl || defaultUrl}</span>
          {!isCustom && defaultUrl !== 'http://localhost:3456' && (
            <span className="ml-1.5 text-accent">(build-time default)</span>
          )}
          {isCustom && (
            <button
              onClick={() => updateServer({ serverUrl: '' })}
              className="ml-2 text-accent hover:underline"
            >
              Reset to default
            </button>
          )}
        </div>

        {/* Test connection */}
        <div>
          <button
            onClick={handleTest}
            disabled={checking}
            className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium
                       hover:bg-accent/90 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checking ? 'Testing…' : 'Test Connection'}
          </button>
          {status && (
            <p className={`mt-2 text-xs ${status.ok ? 'text-success' : 'text-error'}`}>
              {status.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
