import React, { useState, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { McpServer } from '../../types';

export function McpServersSection() {
  const { settings, addMcpServer, updateMcpServer, removeMcpServer, toggleMcpServer } =
    useSettingsStore();
  const { mcpServers } = settings;
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<'form' | 'paste'>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<McpServer | null>(null);
  const [editingArgs, setEditingArgs] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteJson, setPasteJson] = useState('');

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result as string;
        const parsed = JSON.parse(content);

        // Support both Claude Code format and simple array format
        let servers: McpServer[] = [];

        if (parsed.mcpServers) {
          // Claude Code format: { mcpServers: { "name": { command, args, env } } }
          Object.entries(parsed.mcpServers).forEach(([name, config]: [string, any]) => {
            servers.push({
              id: crypto.randomUUID(),
              name,
              command: config.command || '',
              args: Array.isArray(config.args) ? config.args : config.args?.split(' ') || [],
              env: typeof config.env === 'object' ? config.env : {},
              enabled: true,
            });
          });
        } else if (Array.isArray(parsed)) {
          // Simple array format: [{ name, command, args, env }]
          servers = parsed.map((s: any) => ({
            id: crypto.randomUUID(),
            name: s.name || '',
            command: s.command || '',
            args: Array.isArray(s.args) ? s.args : s.args?.split(' ') || [],
            env: typeof s.env === 'object' ? s.env : {},
            enabled: true,
          }));
        }

        // Add all imported servers
        servers.forEach((server) => {
          if (server.name && server.command) {
            addMcpServer(server);
          }
        });

        alert(`Imported ${servers.length} MCP server(s)`);
      } catch (err) {
        alert('Failed to parse JSON file: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteJson.trim()) return;

    try {
      const parsed = JSON.parse(pasteJson);
      let servers: McpServer[] = [];

      if (parsed.mcpServers) {
        // Claude Code format: { mcpServers: { "name": { command, args, env } } }
        Object.entries(parsed.mcpServers).forEach(([name, config]: [string, any]) => {
          servers.push({
            id: crypto.randomUUID(),
            name,
            command: config.command || '',
            args: Array.isArray(config.args) ? config.args : config.args?.split(' ') || [],
            env: typeof config.env === 'object' ? config.env : {},
            enabled: true,
          });
        });
      } else if (Array.isArray(parsed)) {
        // Simple array format: [{ name, command, args, env }]
        servers = parsed.map((s: any) => ({
          id: crypto.randomUUID(),
          name: s.name || '',
          command: s.command || '',
          args: Array.isArray(s.args) ? s.args : s.args?.split(' ') || [],
          env: typeof s.env === 'object' ? s.env : {},
          enabled: true,
        }));
      }

      // Add all servers
      servers.forEach((server) => {
        if (server.name && server.command) {
          addMcpServer(server);
        }
      });

      setPasteJson('');
      setIsAdding(false);
      setAddMode('form');
      alert(`Added ${servers.length} MCP server(s)`);
    } catch (err) {
      alert('Invalid JSON: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
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
                  onClick={() => {
                    if (editingId === server.id) {
                      // Closing edit - save the edited args before closing
                      updateMcpServer(server.id, {
                        args: editingArgs.split(' ').filter(Boolean),
                      });
                      setEditingOriginal(null);
                      setEditingArgs('');
                      setEditingId(null);
                    } else {
                      // Opening edit - save original and initialize args input
                      setEditingOriginal({ ...server });
                      setEditingArgs(server.args.join(' '));
                      setEditingId(server.id);
                    }
                  }}
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
                  onClick={() => {
                    if (confirm(`Remove MCP server "${server.name}"?`)) {
                      removeMcpServer(server.id);
                    }
                  }}
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
                  <label className="text-xs text-text-muted mb-1 block">Name</label>
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => updateMcpServer(server.id, { name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent"
                  />
                </div>
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
                    value={editingId === server.id ? editingArgs : server.args.join(' ')}
                    onChange={(e) => setEditingArgs(e.target.value)}
                    className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    Environment variables (one per line, KEY=VALUE)
                  </label>
                  <textarea
                    value={Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n')}
                    onChange={(e) =>
                      updateMcpServer(server.id, {
                        env: Object.fromEntries(
                          e.target.value.split('\n').map((line) => {
                            const [key, ...rest] = line.split('=');
                            return [key.trim(), rest.join('=').trim()];
                          }).filter(([k]) => k)
                        ),
                      })
                    }
                    rows={2}
                    className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      // Save - parse args and save
                      updateMcpServer(server.id, {
                        args: editingArgs.split(' ').filter(Boolean),
                      });
                      setEditingOriginal(null);
                      setEditingArgs('');
                      setEditingId(null);
                    }}
                    className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                               rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      // Cancel - restore original values
                      if (editingOriginal) {
                        updateMcpServer(server.id, {
                          name: editingOriginal.name,
                          command: editingOriginal.command,
                          args: editingOriginal.args,
                          env: editingOriginal.env,
                        });
                      }
                      setEditingOriginal(null);
                      setEditingArgs('');
                      setEditingId(null);
                    }}
                    className="px-4 py-1.5 bg-surface-hover hover:bg-surface-active text-text-secondary
                               text-sm rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new server form */}
      {isAdding ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          {/* Tab buttons */}
          <div className="flex gap-1 border-b border-border pb-2 mb-2">
            <button
              onClick={() => setAddMode('form')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                addMode === 'form'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setAddMode('paste')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                addMode === 'paste'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              Paste JSON
            </button>
          </div>

          {addMode === 'form' ? (
            <>
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
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-text-primary">Paste MCP Server JSON</h3>
              <p className="text-xs text-text-muted mb-2">
                Supports Claude Code format or simple array format
              </p>
              <textarea
                value={pasteJson}
                onChange={(e) => setPasteJson(e.target.value)}
                placeholder={`{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {}
    }
  }
}`}
                rows={8}
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-xs
                           text-text-primary font-mono focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handlePasteSubmit}
                  disabled={!pasteJson.trim()}
                  className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                             rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Server(s)
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setPasteJson('');
                    setAddMode('form');
                  }}
                  className="px-4 py-1.5 bg-surface-hover hover:bg-surface-active text-text-secondary
                             text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 border border-dashed border-border
                       rounded-lg text-sm text-text-secondary hover:text-text-primary
                       hover:border-text-muted transition-colors flex-1 justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add MCP Server
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-dashed border-border
                       rounded-lg text-sm text-text-secondary hover:text-text-primary
                       hover:border-text-muted transition-colors justify-center"
            title="Import from JSON"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
