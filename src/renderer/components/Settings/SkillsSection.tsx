import React, { useEffect, useState, useCallback } from 'react';
import type { SkillInfo } from '../../types';

export function SkillsSection() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  const loadSkills = useCallback(async () => {
    try {
      const list = await window.api.skills.list();
      setSkills(list);
    } catch (err) {
      console.error('Failed to load skills:', err);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleAdd = async () => {
    if (!newName || !newContent) return;
    const ok = await window.api.skills.create(newName, newContent);
    if (ok) {
      setNewName('');
      setNewContent('');
      setIsAdding(false);
      loadSkills();
    }
  };

  const handleUpdate = async (filePath: string) => {
    const ok = await window.api.skills.update(filePath, editContent);
    if (ok) {
      setEditingPath(null);
      loadSkills();
    }
  };

  const handleRemove = async (skill: SkillInfo) => {
    const ok = await window.api.skills.remove(skill.dirPath);
    if (ok) {
      loadSkills();
    }
  };

  const startEditing = (skill: SkillInfo) => {
    setEditingPath(skill.filePath);
    setEditContent(skill.content);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">Skills</h2>
      <p className="text-sm text-text-muted mb-6">
        Manage Claude Code skills.
        Each skill is a directory with a <code className="text-xs bg-surface px-1 py-0.5 rounded">SKILL.md</code> file
        in <code className="text-xs bg-surface px-1 py-0.5 rounded">~/.claude/skills/</code>
      </p>

      {/* Skill list */}
      <div className="space-y-2 mb-6">
        {skills.length === 0 && !isAdding && (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="mx-auto mb-3 text-text-muted">
              <path d="M4 2.5l8 5.5-8 5.5V2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-text-muted">No skills installed</p>
            <p className="text-xs text-text-muted mt-1">
              Add a skill to extend Claude Code's capabilities
            </p>
          </div>
        )}

        {skills.map((skill) => (
          <div key={skill.dirPath} className="border border-border rounded-lg p-4 bg-surface">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{skill.name}</span>
                {skill.hasTemplate && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">template</span>
                )}
                {skill.hasReferences && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-surface-active text-text-muted">refs</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.api.app.showItemInFolder(skill.dirPath)}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary
                             hover:bg-surface-hover transition-colors"
                  title="Reveal in Finder"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4l2-2h4l1 1h5a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
                <button
                  onClick={() => startEditing(skill)}
                  className="p-1.5 rounded text-text-muted hover:text-text-primary
                             hover:bg-surface-hover transition-colors"
                  title="Edit SKILL.md"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => handleRemove(skill)}
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

            {editingPath !== skill.filePath && skill.description && (
              <p className="text-xs text-text-muted mt-1 line-clamp-2">{skill.description}</p>
            )}

            {/* Inline edit */}
            {editingPath === skill.filePath && (
              <div className="mt-3 pt-3 border-t border-border space-y-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">SKILL.md</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={14}
                    className="w-full px-3 py-2 bg-bg border border-border rounded text-sm
                               text-text-primary font-mono focus:outline-none focus:border-accent resize-none
                               leading-relaxed"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(skill.filePath)}
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

      {/* Add new skill */}
      {isAdding ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Add Skill</h3>

          <div>
            <label className="text-xs text-text-muted mb-1 block">Skill Name (directory name)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="e.g., my-skill"
              className="w-full px-3 py-1.5 bg-bg border border-border rounded text-sm
                         text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="text-xs text-text-muted mt-0.5">
              Will create <code className="bg-surface px-1 rounded">~/.claude/skills/{newName || 'name'}/SKILL.md</code>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">SKILL.md Content</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={'---\nname: my-skill\ndescription: What this skill does\n---\n\n# My Skill\n\nSkill instructions here...'}
              rows={10}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm
                         text-text-primary font-mono focus:outline-none focus:border-accent resize-none
                         leading-relaxed"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!newName || !newContent}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm
                         rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Skill
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewName('');
                setNewContent('');
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
