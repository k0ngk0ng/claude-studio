import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { SkillInfo } from '../../types';

type EditingSkill = {
  name: string;
  type: 'md' | 'sh';
  scope: 'global' | 'project';
  content: string;
  description: string;
  argumentHint: string;
};

const emptySkill: EditingSkill = {
  name: '',
  type: 'md',
  scope: 'global',
  content: '',
  description: '',
  argumentHint: '',
};

function buildContent(skill: EditingSkill): string {
  if (skill.type === 'md') {
    const hasFrontmatter = skill.description || skill.argumentHint;
    if (hasFrontmatter) {
      let fm = '---\n';
      if (skill.description) fm += `description: ${skill.description}\n`;
      if (skill.argumentHint) fm += `argument-hint: ${skill.argumentHint}\n`;
      fm += '---\n\n';
      return fm + skill.content;
    }
    return skill.content;
  }
  // .sh files: ensure shebang
  if (!skill.content.startsWith('#!')) {
    return '#!/bin/bash\n' + skill.content;
  }
  return skill.content;
}

function parseContentForEditing(skill: SkillInfo): EditingSkill {
  let content = skill.content;
  let description = skill.description;
  let argumentHint = skill.argumentHint;

  // Strip frontmatter from content for editing
  if (skill.type === 'md' && content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      content = content.substring(endIdx + 3).replace(/^\n+/, '');
    }
  }

  return {
    name: skill.name,
    type: skill.type,
    scope: skill.scope,
    content,
    description,
    argumentHint,
  };
}

export function SkillsSection() {
  const { currentProject } = useAppStore();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState<EditingSkill>({ ...emptySkill });
  const [editSkill, setEditSkill] = useState<EditingSkill>({ ...emptySkill });

  const loadSkills = useCallback(async () => {
    try {
      const list = await window.api.skills.list(currentProject?.path);
      setSkills(list);
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  }, [currentProject?.path]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleAdd = async () => {
    if (!newSkill.name) return;
    const fileName = `${newSkill.name}.${newSkill.type}`;
    const content = buildContent(newSkill);
    const ok = await window.api.skills.create(
      newSkill.scope,
      fileName,
      content,
      currentProject?.path
    );
    if (ok) {
      setNewSkill({ ...emptySkill });
      setIsAdding(false);
      loadSkills();
    }
  };

  const handleUpdate = async (originalPath: string) => {
    const content = buildContent(editSkill);
    const ok = await window.api.skills.update(originalPath, content);
    if (ok) {
      setEditingPath(null);
      loadSkills();
    }
  };

  const handleRemove = async (skill: SkillInfo) => {
    const ok = await window.api.skills.remove(skill.filePath);
    if (ok) {
      loadSkills();
    }
  };

  const startEditing = (skill: SkillInfo) => {
    setEditingPath(skill.filePath);
    setEditSkill(parseContentForEditing(skill));
  };

  const globalSkills = skills.filter((s) => s.scope === 'global');
  const projectSkills = skills.filter((s) => s.scope === 'project');

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Skills</h2>
      <p className="text-sm text-text-muted mb-6">
        Manage slash commands for Claude Code. Skills are stored as <code className="text-xs bg-surface px-1 py-0.5 rounded">.md</code> or <code className="text-xs bg-surface px-1 py-0.5 rounded">.sh</code> files
        in <code className="text-xs bg-surface px-1 py-0.5 rounded">~/.claude/commands/</code> (global)
        or <code className="text-xs bg-surface px-1 py-0.5 rounded">.claude/commands/</code> (project).
      </p>

      {/* Global Skills */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 8h8M8 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium text-text-primary">Global Skills</span>
          <span className="text-xs text-text-muted">~/.claude/commands/</span>
        </div>

        <div className="space-y-2">
          {globalSkills.length === 0 && !isAdding && (
            <div className="text-center py-6 border border-dashed border-border rounded-lg">
              <p className="text-sm text-text-muted">No global skills configured</p>
              <p className="text-xs text-text-muted mt-1">
                Add a skill to create a reusable slash command
              </p>
            </div>
          )}

          {globalSkills.map((skill) => (
            <SkillCard
              key={skill.filePath}
              skill={skill}
              isEditing={editingPath === skill.filePath}
              editSkill={editSkill}
              setEditSkill={setEditSkill}
              onEdit={() => startEditing(skill)}
              onSave={() => handleUpdate(skill.filePath)}
              onCancel={() => setEditingPath(null)}
              onRemove={() => handleRemove(skill)}
              onOpenFile={() => window.api.app.showItemInFolder(skill.filePath)}
            />
          ))}
        </div>
      </div>

      {/* Project Skills */}
      {currentProject?.path && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
              <path d="M2 4l2-2h4l1 1h5a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <span className="text-sm font-medium text-text-primary">Project Skills</span>
            <span className="text-xs text-text-muted truncate max-w-48">{currentProject.name}/</span>
          </div>

          <div className="space-y-2">
            {projectSkills.length === 0 && (
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <p className="text-sm text-text-muted">No project skills</p>
                <p className="text-xs text-text-muted mt-1">
                  Project skills are scoped to this project only
                </p>
              </div>
            )}

            {projectSkills.map((skill) => (
              <SkillCard
                key={skill.filePath}
                skill={skill}
                isEditing={editingPath === skill.filePath}
                editSkill={editSkill}
                setEditSkill={setEditSkill}
                onEdit={() => startEditing(skill)}
                onSave={() => handleUpdate(skill.filePath)}
                onCancel={() => setEditingPath(null)}
                onRemove={() => handleRemove(skill)}
                onOpenFile={() => window.api.app.showItemInFolder(skill.filePath)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border my-4" />

      {/* Add new skill form */}
      {isAdding ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Add Skill</h3>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-text-muted mb-1 block">Name</label>
              <input
                type="text"
                value={newSkill.name}
                onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                placeholder="e.g., my-skill"
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                           text-text-primary focus:outline-none focus:border-accent"
              />
              <div className="text-xs text-text-muted mt-0.5">
                Usage: <code className="bg-surface px-1 rounded">/{newSkill.name || 'name'}</code>
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs text-text-muted mb-1 block">Type</label>
              <select
                value={newSkill.type}
                onChange={(e) => setNewSkill({ ...newSkill, type: e.target.value as 'md' | 'sh' })}
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                           text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="md">Prompt (.md)</option>
                <option value="sh">Script (.sh)</option>
              </select>
            </div>
            <div className="w-28">
              <label className="text-xs text-text-muted mb-1 block">Scope</label>
              <select
                value={newSkill.scope}
                onChange={(e) => setNewSkill({ ...newSkill, scope: e.target.value as 'global' | 'project' })}
                className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                           text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="global">Global</option>
                {currentProject?.path && <option value="project">Project</option>}
              </select>
            </div>
          </div>

          {newSkill.type === 'md' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted mb-1 block">Description</label>
                <input
                  type="text"
                  value={newSkill.description}
                  onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                  placeholder="Brief description of what this skill does"
                  className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                             text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="w-48">
                <label className="text-xs text-text-muted mb-1 block">Argument hint</label>
                <input
                  type="text"
                  value={newSkill.argumentHint}
                  onChange={(e) => setNewSkill({ ...newSkill, argumentHint: e.target.value })}
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
              value={newSkill.content}
              onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
              placeholder={newSkill.type === 'md'
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
              disabled={!newSkill.name || !newSkill.content}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                         rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Skill
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewSkill({ ...emptySkill });
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
          Add Skill
        </button>
      )}
    </div>
  );
}

/* ─── Skill Card ──────────────────────────────────────────────────── */

function SkillCard({
  skill,
  isEditing,
  editSkill,
  setEditSkill,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  onOpenFile,
}: {
  skill: SkillInfo;
  isEditing: boolean;
  editSkill: EditingSkill;
  setEditSkill: (s: EditingSkill) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onOpenFile: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-surface">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
            skill.type === 'md'
              ? 'bg-accent/10 text-accent'
              : 'bg-warning/10 text-warning'
          }`}>
            .{skill.type}
          </span>
          <span className="text-sm font-medium text-text-primary">/{skill.name}</span>
          {skill.argumentHint && (
            <span className="text-xs text-text-muted">{skill.argumentHint}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenFile}
            className="p-1.5 rounded text-text-muted hover:text-text-primary
                       hover:bg-surface-hover transition-colors"
            title="Reveal in Finder"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4l2-2h4l1 1h5a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button
            onClick={onEdit}
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
            onClick={onRemove}
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

      {!isEditing && skill.description && (
        <p className="text-xs text-text-muted mt-1 line-clamp-2">{skill.description}</p>
      )}

      {/* Expanded edit view */}
      {isEditing && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {editSkill.type === 'md' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted mb-1 block">Description</label>
                <input
                  type="text"
                  value={editSkill.description}
                  onChange={(e) => setEditSkill({ ...editSkill, description: e.target.value })}
                  className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                             text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="w-48">
                <label className="text-xs text-text-muted mb-1 block">Argument hint</label>
                <input
                  type="text"
                  value={editSkill.argumentHint}
                  onChange={(e) => setEditSkill({ ...editSkill, argumentHint: e.target.value })}
                  className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                             text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-text-muted mb-1 block">Content</label>
            <textarea
              value={editSkill.content}
              onChange={(e) => setEditSkill({ ...editSkill, content: e.target.value })}
              rows={10}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent resize-none
                         leading-relaxed"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                         rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-1.5 bg-surface-hover hover:bg-surface-active text-text-secondary
                         text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
