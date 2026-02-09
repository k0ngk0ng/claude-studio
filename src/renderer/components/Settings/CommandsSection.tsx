import React, { useEffect, useState, useCallback } from 'react';
import type { CommandInfo } from '../../types';

type EditingCommand = {
  name: string;
  type: 'md' | 'sh';
  content: string;
  description: string;
  argumentHint: string;
};

const emptyCommand: EditingCommand = {
  name: '',
  type: 'md',
  content: '',
  description: '',
  argumentHint: '',
};

function buildContent(cmd: EditingCommand): string {
  if (cmd.type === 'md') {
    const hasFrontmatter = cmd.description || cmd.argumentHint;
    if (hasFrontmatter) {
      let fm = '---\n';
      if (cmd.description) fm += `description: ${cmd.description}\n`;
      if (cmd.argumentHint) fm += `argument-hint: ${cmd.argumentHint}\n`;
      fm += '---\n\n';
      return fm + cmd.content;
    }
    return cmd.content;
  }
  if (!cmd.content.startsWith('#!')) {
    return '#!/bin/bash\n' + cmd.content;
  }
  return cmd.content;
}

function parseForEditing(cmd: CommandInfo): EditingCommand {
  let content = cmd.content;

  // Strip frontmatter from content for editing
  if (cmd.type === 'md' && content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      content = content.substring(endIdx + 3).replace(/^\n+/, '');
    }
  }

  return {
    name: cmd.name,
    type: cmd.type,
    content,
    description: cmd.description,
    argumentHint: cmd.argumentHint,
  };
}

export function CommandsSection() {
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [newCmd, setNewCmd] = useState<EditingCommand>({ ...emptyCommand });
  const [editCmd, setEditCmd] = useState<EditingCommand>({ ...emptyCommand });

  const loadCommands = useCallback(async () => {
    try {
      const list = await window.api.commands.list();
      setCommands(list);
    } catch (err) {
      console.error('Failed to load commands:', err);
    }
  }, []);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const handleAdd = async () => {
    if (!newCmd.name) return;
    const fileName = `${newCmd.name}.${newCmd.type}`;
    const content = buildContent(newCmd);
    const ok = await window.api.commands.create(fileName, content);
    if (ok) {
      setNewCmd({ ...emptyCommand });
      setIsAdding(false);
      loadCommands();
    }
  };

  const handleUpdate = async (originalPath: string) => {
    const content = buildContent(editCmd);
    const ok = await window.api.commands.update(originalPath, content);
    if (ok) {
      setEditingPath(null);
      loadCommands();
    }
  };

  const handleRemove = async (cmd: CommandInfo) => {
    const ok = await window.api.commands.remove(cmd.filePath);
    if (ok) {
      loadCommands();
    }
  };

  const startEditing = (cmd: CommandInfo) => {
    setEditingPath(cmd.filePath);
    setEditCmd(parseForEditing(cmd));
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Commands</h2>
      <p className="text-sm text-text-muted mb-6">
        Manage Claude Code slash commands.
        Stored as <code className="text-xs bg-surface px-1 py-0.5 rounded">.md</code> or <code className="text-xs bg-surface px-1 py-0.5 rounded">.sh</code> files
        in <code className="text-xs bg-surface px-1 py-0.5 rounded">~/.claude/commands/</code>
      </p>

      {/* Command list */}
      <div className="space-y-2 mb-6">
        {commands.length === 0 && !isAdding && (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="mx-auto mb-3 text-text-muted">
              <path d="M4.5 6l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 10h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <p className="text-sm text-text-muted">No commands configured</p>
            <p className="text-xs text-text-muted mt-1">
              Add a command to create a reusable slash command
            </p>
          </div>
        )}

        {commands.map((cmd) => (
          <div key={cmd.filePath} className="border border-border rounded-lg p-4 bg-surface">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  cmd.type === 'md'
                    ? 'bg-accent/10 text-accent'
                    : 'bg-warning/10 text-warning'
                }`}>
                  .{cmd.type}
                </span>
                <span className="text-sm font-medium text-text-primary">/{cmd.name}</span>
                {cmd.argumentHint && (
                  <span className="text-xs text-text-muted">{cmd.argumentHint}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.api.app.showItemInFolder(cmd.filePath)}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary
                             hover:bg-surface-hover transition-colors"
                  title="Reveal in Finder"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4l2-2h4l1 1h5a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
                <button
                  onClick={() => startEditing(cmd)}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary
                             hover:bg-surface-hover transition-colors"
                  title="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => handleRemove(cmd)}
                  className="p-1.5 rounded text-text-muted hover:text-error
                             hover:bg-surface-hover transition-colors"
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {editingPath !== cmd.filePath && cmd.description && (
              <p className="text-xs text-text-muted mt-1 line-clamp-2">{cmd.description}</p>
            )}

            {/* Inline edit */}
            {editingPath === cmd.filePath && (
              <div className="mt-3 pt-3 border-t border-border space-y-3">
                {editCmd.type === 'md' && (
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-text-muted mb-1 block">Description</label>
                      <input
                        type="text"
                        value={editCmd.description}
                        onChange={(e) => setEditCmd({ ...editCmd, description: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                                   text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="w-48">
                      <label className="text-xs text-text-muted mb-1 block">Argument hint</label>
                      <input
                        type="text"
                        value={editCmd.argumentHint}
                        onChange={(e) => setEditCmd({ ...editCmd, argumentHint: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                                   text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Content</label>
                  <textarea
                    value={editCmd.content}
                    onChange={(e) => setEditCmd({ ...editCmd, content: e.target.value })}
                    rows={10}
                    className="w-full px-3 py-2 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent resize-none
                               leading-relaxed"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(cmd.filePath)}
                    className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                               rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingPath(null)}
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

      {/* Add new command */}
      {isAdding ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Add Command</h3>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-text-muted mb-1 block">Name</label>
              <input
                type="text"
                value={newCmd.name}
                onChange={(e) => setNewCmd({ ...newCmd, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                placeholder="e.g., my-command"
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                           text-text-primary focus:outline-none focus:border-accent"
              />
              <div className="text-xs text-text-muted mt-0.5">
                Usage: <code className="bg-surface px-1 rounded">/{newCmd.name || 'name'}</code>
              </div>
            </div>
            <div className="w-32">
              <label className="text-xs text-text-muted mb-1 block">Type</label>
              <select
                value={newCmd.type}
                onChange={(e) => setNewCmd({ ...newCmd, type: e.target.value as 'md' | 'sh' })}
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                           text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="md">Prompt (.md)</option>
                <option value="sh">Script (.sh)</option>
              </select>
            </div>
          </div>

          {newCmd.type === 'md' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted mb-1 block">Description</label>
                <input
                  type="text"
                  value={newCmd.description}
                  onChange={(e) => setNewCmd({ ...newCmd, description: e.target.value })}
                  placeholder="Brief description of what this command does"
                  className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                             text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="w-48">
                <label className="text-xs text-text-muted mb-1 block">Argument hint</label>
                <input
                  type="text"
                  value={newCmd.argumentHint}
                  onChange={(e) => setNewCmd({ ...newCmd, argumentHint: e.target.value })}
                  placeholder="e.g., [task description]"
                  className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                             text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-1 block">Content</label>
            <textarea
              value={newCmd.content}
              onChange={(e) => setNewCmd({ ...newCmd, content: e.target.value })}
              placeholder={newCmd.type === 'md'
                ? 'Enter the prompt template...\n\nUse $ARGUMENTS to reference user input.'
                : '# Your script here\n# Arguments are passed as $1, $2, etc.'}
              rows={8}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent resize-none
                         leading-relaxed"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!newCmd.name || !newCmd.content}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                         rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Command
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewCmd({ ...emptyCommand });
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
          Add Command
        </button>
      )}
    </div>
  );
}
