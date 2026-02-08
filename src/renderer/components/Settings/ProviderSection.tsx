import React, { useState, useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsInput } from './controls/SettingsInput';
import { SettingsSelect } from './controls/SettingsSelect';
import { SettingsTextarea } from './controls/SettingsTextarea';
import { SettingsToggle } from './controls/SettingsToggle';
import type { ProviderEnvVar } from '../../types';

// ─── Predefined env var keys (used in grouped sections) ─────────────
const PREDEFINED_KEYS = new Set([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH', 'CLAUDE_CODE_SKIP_VERTEX_AUTH', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL',
  'MAX_THINKING_TOKENS', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'DISABLE_TELEMETRY', 'DISABLE_ERROR_REPORTING', 'DISABLE_COST_WARNINGS', 'CLAUDE_CODE_HIDE_ACCOUNT_INFO',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', 'DISABLE_AUTOUPDATER', 'DISABLE_BUG_COMMAND',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SHELL',
]);

// ─── Helper: get env var value from settings ────────────────────────
function getEnvVal(envVars: ProviderEnvVar[], key: string): string {
  return envVars.find((v) => v.key === key)?.value || '';
}

function isEnvEnabled(envVars: ProviderEnvVar[], key: string): boolean {
  const v = envVars.find((ev) => ev.key === key);
  return v ? v.enabled : false;
}

function isEnvToggleOn(envVars: ProviderEnvVar[], key: string): boolean {
  const v = envVars.find((ev) => ev.key === key);
  return v ? v.enabled && v.value === '1' : false;
}

// ─── Chevron icon ───────────────────────────────────────────────────
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Collapsible section wrapper ────────────────────────────────────
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-text-primary
                   hover:bg-surface-hover transition-colors text-left"
      >
        <ChevronIcon open={open} />
        <span>{title}</span>
      </button>
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Password input with show/hide toggle ───────────────────────────
function PasswordInput({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="text-sm font-medium text-text-primary mb-0.5">{label}</div>
      <div className="text-xs text-text-muted mb-2">{description}</div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 bg-surface border border-border rounded-lg text-sm
                     text-text-primary focus:outline-none focus:border-accent
                     placeholder:text-text-muted font-mono"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted
                     hover:text-text-primary transition-colors"
          title={show ? 'Hide' : 'Show'}
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M6.5 6.5a2 2 0 002.8 2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M4.2 4.2C2.8 5.2 1.5 7 1.5 8s2.5 4.5 6.5 4.5c1.2 0 2.3-.3 3.2-.8M8 3.5c4 0 6.5 3.5 6.5 4.5 0 .5-.7 1.7-2 2.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5C4 3.5 1.5 7 1.5 8S4 12.5 8 12.5 14.5 9 14.5 8 12 3.5 8 3.5z" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────
export function ProviderSection() {
  const { settings, updateProvider, setEnvVars, addEnvVar, removeEnvVar, updateEnvVar } = useSettingsStore();
  const { provider } = settings;
  const { envVars } = provider;
  const importRef = useRef<HTMLInputElement>(null);
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomValue, setNewCustomValue] = useState('');

  // ─── Env var helpers ────────────────────────────────────────────
  const setEnv = useCallback((key: string, value: string) => {
    const existing = envVars.find((v) => v.key === key);
    if (existing) {
      updateEnvVar(key, { value, enabled: true });
    } else {
      addEnvVar({ key, value, enabled: true });
    }
  }, [envVars, updateEnvVar, addEnvVar]);

  const setEnvToggle = useCallback((key: string, on: boolean) => {
    const existing = envVars.find((v) => v.key === key);
    if (existing) {
      updateEnvVar(key, { value: on ? '1' : '0', enabled: on });
    } else if (on) {
      addEnvVar({ key, value: '1', enabled: true });
    }
  }, [envVars, updateEnvVar, addEnvVar]);

  // ─── Import / Export ────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const data = JSON.stringify(provider, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claude-provider-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [provider]);

  const handleImport = useCallback(() => {
    importRef.current?.click();
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.envVars && Array.isArray(data.envVars)) {
          setEnvVars(data.envVars);
        }
        if (data.defaultModel !== undefined) updateProvider({ defaultModel: data.defaultModel });
        if (data.maxTokens !== undefined) updateProvider({ maxTokens: data.maxTokens });
        if (data.temperature !== undefined) updateProvider({ temperature: data.temperature });
        if (data.systemPrompt !== undefined) updateProvider({ systemPrompt: data.systemPrompt });
      } catch {
        // Invalid JSON — ignore
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setEnvVars, updateProvider]);

  // Custom env vars (not in predefined list)
  const customEnvVars = envVars.filter((v) => !PREDEFINED_KEYS.has(v.key));

  const handleAddCustom = useCallback(() => {
    const key = newCustomKey.trim().toUpperCase();
    if (!key) return;
    if (envVars.some((v) => v.key === key)) return;
    addEnvVar({ key, value: newCustomValue, enabled: true });
    setNewCustomKey('');
    setNewCustomValue('');
  }, [newCustomKey, newCustomValue, envVars, addEnvVar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-text-primary">Provider</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary
                       hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Import
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary
                       hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Export
          </button>
          <input ref={importRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
        </div>
      </div>
      <p className="text-sm text-text-muted mb-6">
        Configure provider, model, and environment settings for Claude.
      </p>

      <div className="space-y-4">
        {/* ── Model Configuration (expanded by default) ─────────── */}
        <CollapsibleSection title="Model Configuration" defaultOpen>
          <SettingsInput
            label="Model"
            description="Override the default model (ANTHROPIC_MODEL)."
            type="text"
            value={getEnvVal(envVars, 'ANTHROPIC_MODEL')}
            onChange={(v) => setEnv('ANTHROPIC_MODEL', v)}
            placeholder="claude-sonnet-4-20250514"
          />
          <SettingsInput
            label="Default Sonnet Model"
            description="Override the default Sonnet model variant."
            type="text"
            value={getEnvVal(envVars, 'ANTHROPIC_DEFAULT_SONNET_MODEL')}
            onChange={(v) => setEnv('ANTHROPIC_DEFAULT_SONNET_MODEL', v)}
            placeholder="claude-sonnet-4-20250514"
          />
          <SettingsInput
            label="Default Opus Model"
            description="Override the default Opus model variant."
            type="text"
            value={getEnvVal(envVars, 'ANTHROPIC_DEFAULT_OPUS_MODEL')}
            onChange={(v) => setEnv('ANTHROPIC_DEFAULT_OPUS_MODEL', v)}
            placeholder="claude-opus-4-20250514"
          />
          <SettingsInput
            label="Default Haiku Model"
            description="Override the default Haiku model variant."
            type="text"
            value={getEnvVal(envVars, 'ANTHROPIC_DEFAULT_HAIKU_MODEL')}
            onChange={(v) => setEnv('ANTHROPIC_DEFAULT_HAIKU_MODEL', v)}
            placeholder="claude-haiku-3-5-20241022"
          />
          <SettingsInput
            label="Subagent Model"
            description="Model used for subagent tasks (CLAUDE_CODE_SUBAGENT_MODEL)."
            type="text"
            value={getEnvVal(envVars, 'CLAUDE_CODE_SUBAGENT_MODEL')}
            onChange={(v) => setEnv('CLAUDE_CODE_SUBAGENT_MODEL', v)}
            placeholder=""
          />
          <SettingsSelect
            label="Effort Level"
            description="Controls how much effort Claude puts into responses."
            value={getEnvVal(envVars, 'CLAUDE_CODE_EFFORT_LEVEL') || 'high'}
            onChange={(v) => setEnv('CLAUDE_CODE_EFFORT_LEVEL', v)}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
          <SettingsInput
            label="Max Thinking Tokens"
            description="Maximum tokens for extended thinking (MAX_THINKING_TOKENS)."
            type="number"
            value={getEnvVal(envVars, 'MAX_THINKING_TOKENS')}
            onChange={(v) => setEnv('MAX_THINKING_TOKENS', v)}
            placeholder="10000"
          />
          <SettingsInput
            label="Max Output Tokens"
            description="Maximum tokens in each response (CLAUDE_CODE_MAX_OUTPUT_TOKENS)."
            type="number"
            value={getEnvVal(envVars, 'CLAUDE_CODE_MAX_OUTPUT_TOKENS')}
            onChange={(v) => setEnv('CLAUDE_CODE_MAX_OUTPUT_TOKENS', v)}
            placeholder="16384"
          />
        </CollapsibleSection>

        {/* ── API & Authentication ──────────────────────────────── */}
        <CollapsibleSection title="API & Authentication">
          <PasswordInput
            label="API Key"
            description="Your Anthropic API key (ANTHROPIC_API_KEY)."
            value={getEnvVal(envVars, 'ANTHROPIC_API_KEY')}
            onChange={(v) => setEnv('ANTHROPIC_API_KEY', v)}
            placeholder="sk-ant-..."
          />
          <PasswordInput
            label="Auth Token"
            description="OAuth/auth token (ANTHROPIC_AUTH_TOKEN)."
            value={getEnvVal(envVars, 'ANTHROPIC_AUTH_TOKEN')}
            onChange={(v) => setEnv('ANTHROPIC_AUTH_TOKEN', v)}
          />
          <SettingsInput
            label="Base URL"
            description="Custom API base URL (ANTHROPIC_BASE_URL)."
            type="text"
            value={getEnvVal(envVars, 'ANTHROPIC_BASE_URL')}
            onChange={(v) => setEnv('ANTHROPIC_BASE_URL', v)}
            placeholder="https://api.anthropic.com"
          />
          <SettingsTextarea
            label="Custom Headers"
            description="Additional HTTP headers as JSON (ANTHROPIC_CUSTOM_HEADERS)."
            value={getEnvVal(envVars, 'ANTHROPIC_CUSTOM_HEADERS')}
            onChange={(v) => setEnv('ANTHROPIC_CUSTOM_HEADERS', v)}
            placeholder='{"X-Custom-Header": "value"}'
            rows={3}
          />
        </CollapsibleSection>

        {/* ── Provider Selection ─────────────────────────────────── */}
        <CollapsibleSection title="Provider Selection">
          <SettingsToggle
            label="Use Amazon Bedrock"
            description="Route requests through Amazon Bedrock (CLAUDE_CODE_USE_BEDROCK)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_USE_BEDROCK')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_USE_BEDROCK', v)}
          />
          <SettingsToggle
            label="Use Google Vertex AI"
            description="Route requests through Google Vertex AI (CLAUDE_CODE_USE_VERTEX)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_USE_VERTEX')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_USE_VERTEX', v)}
          />
          <SettingsToggle
            label="Use Microsoft Foundry"
            description="Route requests through Microsoft Foundry (CLAUDE_CODE_USE_FOUNDRY)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_USE_FOUNDRY')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_USE_FOUNDRY', v)}
          />
          <SettingsToggle
            label="Skip Bedrock Auth"
            description="Skip authentication for Bedrock (CLAUDE_CODE_SKIP_BEDROCK_AUTH)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_SKIP_BEDROCK_AUTH')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_SKIP_BEDROCK_AUTH', v)}
          />
          <SettingsToggle
            label="Skip Vertex Auth"
            description="Skip authentication for Vertex AI (CLAUDE_CODE_SKIP_VERTEX_AUTH)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_SKIP_VERTEX_AUTH')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_SKIP_VERTEX_AUTH', v)}
          />
          <SettingsToggle
            label="Skip Foundry Auth"
            description="Skip authentication for Foundry (CLAUDE_CODE_SKIP_FOUNDRY_AUTH)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_SKIP_FOUNDRY_AUTH', v)}
          />
        </CollapsibleSection>

        {/* ── Proxy & Networking ─────────────────────────────────── */}
        <CollapsibleSection title="Proxy & Networking">
          <SettingsInput
            label="HTTP Proxy"
            description="HTTP proxy URL (HTTP_PROXY)."
            type="text"
            value={getEnvVal(envVars, 'HTTP_PROXY')}
            onChange={(v) => setEnv('HTTP_PROXY', v)}
            placeholder="http://proxy:8080"
          />
          <SettingsInput
            label="HTTPS Proxy"
            description="HTTPS proxy URL (HTTPS_PROXY)."
            type="text"
            value={getEnvVal(envVars, 'HTTPS_PROXY')}
            onChange={(v) => setEnv('HTTPS_PROXY', v)}
            placeholder="https://proxy:8443"
          />
          <SettingsInput
            label="No Proxy"
            description="Comma-separated list of hosts to bypass proxy (NO_PROXY)."
            type="text"
            value={getEnvVal(envVars, 'NO_PROXY')}
            onChange={(v) => setEnv('NO_PROXY', v)}
            placeholder="localhost,127.0.0.1"
          />
        </CollapsibleSection>

        {/* ── Privacy & Telemetry ────────────────────────────────── */}
        <CollapsibleSection title="Privacy & Telemetry">
          <SettingsToggle
            label="Disable Telemetry"
            description="Disable all telemetry data collection (DISABLE_TELEMETRY)."
            checked={isEnvToggleOn(envVars, 'DISABLE_TELEMETRY')}
            onChange={(v) => setEnvToggle('DISABLE_TELEMETRY', v)}
          />
          <SettingsToggle
            label="Disable Error Reporting"
            description="Disable automatic error reporting (DISABLE_ERROR_REPORTING)."
            checked={isEnvToggleOn(envVars, 'DISABLE_ERROR_REPORTING')}
            onChange={(v) => setEnvToggle('DISABLE_ERROR_REPORTING', v)}
          />
          <SettingsToggle
            label="Disable Cost Warnings"
            description="Suppress cost threshold warnings (DISABLE_COST_WARNINGS)."
            checked={isEnvToggleOn(envVars, 'DISABLE_COST_WARNINGS')}
            onChange={(v) => setEnvToggle('DISABLE_COST_WARNINGS', v)}
          />
          <SettingsToggle
            label="Hide Account Info"
            description="Hide account information in the UI (CLAUDE_CODE_HIDE_ACCOUNT_INFO)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_HIDE_ACCOUNT_INFO')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_HIDE_ACCOUNT_INFO', v)}
          />
        </CollapsibleSection>

        {/* ── Advanced ───────────────────────────────────────────── */}
        <CollapsibleSection title="Advanced">
          <SettingsTextarea
            label="Custom system prompt"
            description="Additional instructions prepended to every conversation. Leave empty to use the default."
            value={provider.systemPrompt}
            onChange={(v) => updateProvider({ systemPrompt: v })}
            placeholder="e.g., Always respond in Chinese. Prefer functional programming patterns."
            rows={4}
          />
          {/* Temperature slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-text-primary">Temperature</label>
              <span className="text-sm text-text-muted font-mono">{provider.temperature.toFixed(1)}</span>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Controls randomness. Lower values are more focused, higher values more creative.
            </p>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={provider.temperature}
              onChange={(e) => updateProvider({ temperature: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-surface rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-text-muted">Precise</span>
              <span className="text-xs text-text-muted">Creative</span>
            </div>
          </div>
          <SettingsToggle
            label="Enable Agent Teams"
            description="Enable experimental multi-agent team support (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)."
            checked={isEnvToggleOn(envVars, 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')}
            onChange={(v) => setEnvToggle('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', v)}
          />
          <SettingsToggle
            label="Disable Auto Updates"
            description="Disable automatic update checks (DISABLE_AUTOUPDATER)."
            checked={isEnvToggleOn(envVars, 'DISABLE_AUTOUPDATER')}
            onChange={(v) => setEnvToggle('DISABLE_AUTOUPDATER', v)}
          />
          <SettingsToggle
            label="Disable Bug Command"
            description="Disable the /bug command (DISABLE_BUG_COMMAND)."
            checked={isEnvToggleOn(envVars, 'DISABLE_BUG_COMMAND')}
            onChange={(v) => setEnvToggle('DISABLE_BUG_COMMAND', v)}
          />
          <SettingsInput
            label="Config Directory"
            description="Custom config directory path (CLAUDE_CONFIG_DIR)."
            type="text"
            value={getEnvVal(envVars, 'CLAUDE_CONFIG_DIR')}
            onChange={(v) => setEnv('CLAUDE_CONFIG_DIR', v)}
            placeholder="~/.claude"
          />
          <SettingsInput
            label="Shell Override"
            description="Override the shell used for Bash commands (CLAUDE_CODE_SHELL)."
            type="text"
            value={getEnvVal(envVars, 'CLAUDE_CODE_SHELL')}
            onChange={(v) => setEnv('CLAUDE_CODE_SHELL', v)}
            placeholder="/bin/bash"
          />
        </CollapsibleSection>

        {/* ── Custom Environment Variables ───────────────────────── */}
        <CollapsibleSection title="Custom Environment Variables">
          <p className="text-xs text-text-muted -mt-1 mb-3">
            Add arbitrary environment variables passed to the Claude process.
          </p>
          {customEnvVars.length > 0 && (
            <div className="space-y-2">
              {customEnvVars.map((ev) => (
                <div key={ev.key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ev.key}
                    readOnly
                    className="w-40 px-2 py-1.5 bg-bg border border-border rounded text-xs
                               text-text-primary font-mono"
                  />
                  <span className="text-text-muted text-xs">=</span>
                  <input
                    type="text"
                    value={ev.value}
                    onChange={(e) => updateEnvVar(ev.key, { value: e.target.value })}
                    className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-xs
                               text-text-primary font-mono focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => {
                      updateEnvVar(ev.key, { enabled: !ev.enabled });
                    }}
                    className={`px-2 py-1.5 rounded text-xs transition-colors ${
                      ev.enabled
                        ? 'bg-accent/20 text-accent'
                        : 'bg-surface text-text-muted'
                    }`}
                    title={ev.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  >
                    {ev.enabled ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => removeEnvVar(ev.key)}
                    className="p-1.5 rounded text-text-muted hover:text-error hover:bg-error/10
                               transition-colors"
                    title="Remove"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add new row */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newCustomKey}
              onChange={(e) => setNewCustomKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom(); }}
              placeholder="KEY"
              className="w-40 px-2 py-1.5 bg-surface border border-border rounded text-xs
                         text-text-primary font-mono placeholder:text-text-muted
                         focus:outline-none focus:border-accent"
            />
            <span className="text-text-muted text-xs">=</span>
            <input
              type="text"
              value={newCustomValue}
              onChange={(e) => setNewCustomValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom(); }}
              placeholder="value"
              className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-xs
                         text-text-primary font-mono placeholder:text-text-muted
                         focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleAddCustom}
              disabled={!newCustomKey.trim()}
              className="px-3 py-1.5 rounded text-xs bg-accent text-white
                         hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors"
            >
              Add
            </button>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
