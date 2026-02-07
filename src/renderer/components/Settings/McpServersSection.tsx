import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { McpServer } from '../../types';

export function McpServersSection() {
  const { settings, addMcpServer, updateMcpServer, removeMcpServer, toggleMcpServer } =
    useSettingsStore();
  const { mcpServers } = settings;
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newServer, setNewServer] = useState({
    name: '',
    command: '',
    args: '',
    env: '',
  });

  const handleAdd = () => {
    if (!newServer.name || !newServer.command) return;

    const server: McpServer = {
      id: crypto.randomUUID(),
      name: newServer.name,
      command: newServer.command,
      args: newServer.args
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean),
      env: newServer.env
        ? Object.fromEntries(
            newServer.env.split('\n').map((line) => {
              const [key, ...rest] = line.split('=');
              return [key.trim(), rest.join('=').trim()];
            })
          )
        : {},
      enabled: true,
    };

    addMcpServer(server);
    setNewServer({ name: '', command: '', args: '', env: '' });
    setIsAdding(false);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">MCP Servers</h2>
      <p className="text-sm text-text-muted mb-6">
        Configure Model Context Protocol servers to extend Claude's capabilities with custom tools.
      </p>

      {/* Server list */}
      <div className="space-y-3 mb-6">
        {mcpServers.length === 0 && !isAdding && (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <svg
              width="32"
              height="32"
              viewBox="0 0 16 16"
              fill="none"
              className="mx-auto mb-3 text-text-muted"
            >
              <rect x="2" y="3" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="2" y="9" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="4.5" cy="5" r="0.75" fill="currentColor" />
              <circle cx="4.5" cy="11" r="0.75" fill="currentColor" />
            </svg>
            <p className="text-sm text-text-muted">No MCP servers configured</p>
            <p className="text-xs text-text-muted mt-1">
              Add a server to extend Claude with custom tools
            </p>
          </div>
        )}

        {mcpServers.map((server) => (
          <div
            key={server.id}
            className="border border-border rounded-lg p-4 bg-surface"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleMcpServer(server.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors duration-200
                    ${server.enabled ? 'bg-accent' : 'bg-surface-active'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
                      transition-transform duration-200
                      ${server.enabled ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
                <div>
                  <span className="text-sm font-medium text-text-primary">{server.name}</span>
                  <span className="text-xs text-text-muted ml-2 font-mono">{server.command}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditingId(editingId === server.id ? null : server.id)}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary
                             hover:bg-surface-hover transition-colors"
                  title="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => removeMcpServer(server.id)}
                  className="p-1.5 rounded text-text-muted hover:text-error
                             hover:bg-surface-hover transition-colors"
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Expanded edit view */}
            {editingId === server.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Command</label>
                  <input
                    type="text"
                    value={server.command}
                    onChange={(e) => updateMcpServer(server.id, { command: e.target.value })}
                    className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Arguments (space-separated)</label>
                  <input
                    type="text"
                    value={server.args.join(' ')}
                    onChange={(e) =>
                      updateMcpServer(server.id, {
                        args: e.target.value.split(' ').filter(Boolean),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new server form */}
      {isAdding ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Add MCP Server</h3>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Name</label>
            <input
              type="text"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              placeholder="e.g., filesystem"
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                         text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Command</label>
            <input
              type="text"
              value={newServer.command}
              onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
              placeholder="e.g., npx"
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Arguments (space-separated)</label>
            <input
              type="text"
              value={newServer.args}
              onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
              placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path"
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Environment variables (one per line, KEY=VALUE)
            </label>
            <textarea
              value={newServer.env}
              onChange={(e) => setNewServer({ ...newServer, env: e.target.value })}
              placeholder="API_KEY=xxx"
              rows={2}
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!newServer.name || !newServer.command}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                         rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Server
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewServer({ name: '', command: '', args: '', env: '' });
              }}
              className="px-4 py-1.5 bg-surface-hover hover:bg-surface-active text-text-secondary
                         text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 border border-dashed border-border
                     rounded-lg text-sm text-text-secondary hover:text-text-primary
                     hover:border-text-muted transition-colors w-full justify-center"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Add MCP Server
        </button>
      )}
    </div>
  );
}
