import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export function KeybindingsSection() {
  const { settings } = useSettingsStore();
  const { keybindings } = settings;

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Keybindings</h2>
      <p className="text-sm text-text-muted mb-6">
        Keyboard shortcuts for common actions.
      </p>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface">
              <th className="text-left text-xs font-medium text-text-muted px-4 py-2.5">Action</th>
              <th className="text-right text-xs font-medium text-text-muted px-4 py-2.5">Shortcut</th>
            </tr>
          </thead>
          <tbody>
            {keybindings.map((kb, index) => (
              <tr
                key={kb.id}
                className={`${index !== keybindings.length - 1 ? 'border-b border-border' : ''}`}
              >
                <td className="px-4 py-3">
                  <span className="text-sm text-text-primary">{kb.label}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <kbd
                    className="inline-flex items-center gap-1 px-2 py-1 bg-surface border border-border
                               rounded text-xs font-mono text-text-secondary"
                  >
                    {kb.keys}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted mt-4">
        Custom keybinding configuration coming soon. Currently showing default shortcuts.
      </p>
    </div>
  );
}
