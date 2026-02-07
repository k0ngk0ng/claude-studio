import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SettingsInput } from './controls/SettingsInput';
import { SettingsSelect } from './controls/SettingsSelect';
import { SettingsTextarea } from './controls/SettingsTextarea';

export function ModelSection() {
  const { settings, updateModel } = useSettingsStore();
  const { model } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Model</h2>
      <p className="text-sm text-text-muted mb-6">
        Configure the AI model and generation parameters.
      </p>

      <div className="space-y-6">
        {/* Default model */}
        <SettingsSelect
          label="Default model"
          description="The model to use for new conversations."
          value={model.defaultModel}
          onChange={(v) => updateModel({ defaultModel: v })}
          options={[
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'claude-haiku-3-5-20241022', label: 'Claude 3.5 Haiku' },
          ]}
        />

        {/* Max tokens */}
        <SettingsInput
          label="Max output tokens"
          description="Maximum number of tokens in each response. Higher values allow longer responses."
          type="number"
          value={model.maxTokens.toString()}
          onChange={(v) => updateModel({ maxTokens: parseInt(v) || 16384 })}
          min={1024}
          max={128000}
        />

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-text-primary">Temperature</label>
            <span className="text-sm text-text-muted font-mono">{model.temperature.toFixed(1)}</span>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Controls randomness. Lower values are more focused, higher values more creative.
          </p>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={model.temperature}
            onChange={(e) => updateModel({ temperature: parseFloat(e.target.value) })}
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

        {/* System prompt */}
        <SettingsTextarea
          label="Custom system prompt"
          description="Additional instructions prepended to every conversation. Leave empty to use the default."
          value={model.systemPrompt}
          onChange={(v) => updateModel({ systemPrompt: v })}
          placeholder="e.g., Always respond in Chinese. Prefer functional programming patterns."
          rows={4}
        />
      </div>
    </div>
  );
}
