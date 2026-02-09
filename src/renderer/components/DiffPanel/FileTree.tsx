import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isDir = i < parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      let existing = current.find((n) => n.name === name && n.isDir === isDir);
      if (!existing) {
        existing = { name, path, isDir, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  // Sort: directories first, then alphabetically
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortTree(node.children);
    }
  }

  sortTree(root);
  return root;
}

function FileIcon({ name, isDir, isOpen }: { name: string; isDir: boolean; isOpen?: boolean }) {
  if (isDir) {
    return isOpen ? (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-warning shrink-0">
        <path d="M2 5.5A1.5 1.5 0 013.5 4H6l1.5 1.5h5A1.5 1.5 0 0114 7v4.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-6z"
          stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-warning shrink-0">
        <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
          stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  // File icon — vary by extension
  const ext = name.split('.').pop()?.toLowerCase() || '';
  let color = 'text-text-muted';
  if (['ts', 'tsx'].includes(ext)) color = 'text-info';
  else if (['js', 'jsx'].includes(ext)) color = 'text-warning';
  else if (['css', 'scss', 'less'].includes(ext)) color = 'text-accent';
  else if (['json', 'yaml', 'yml', 'toml'].includes(ext)) color = 'text-success';
  else if (['md', 'mdx', 'txt'].includes(ext)) color = 'text-text-secondary';
  else if (['html', 'htm'].includes(ext)) color = 'text-error';
  else if (['py'].includes(ext)) color = 'text-info';
  else if (['rs'].includes(ext)) color = 'text-error';
  else if (['go'].includes(ext)) color = 'text-info';

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`${color} shrink-0`}>
      <path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z"
        stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Context Menu ────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  node: TreeNode;
  projectPath: string;
  onClose: () => void;
}

function ContextMenu({ x, y, node, projectPath, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  const fullPath = `${projectPath}/${node.path}`;

  const handleCopyName = () => {
    navigator.clipboard.writeText(node.name);
    onClose();
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(node.path);
    onClose();
  };

  const handleCopyFullPath = () => {
    navigator.clipboard.writeText(fullPath);
    onClose();
  };

  const handleRevealInFinder = () => {
    window.api.app.showItemInFolder(fullPath);
    onClose();
  };

  const handleOpenFile = () => {
    window.api.app.openFile(fullPath);
    onClose();
  };

  const handleOpenInEditor = async (editor: string) => {
    // For files, open the file directly; for dirs, open the dir
    await window.api.app.openInEditor(fullPath, editor);
    onClose();
  };

  const menuItems: { label: string; icon: React.ReactNode; action: () => void; separator?: boolean }[] = [];

  if (!node.isDir) {
    menuItems.push({
      label: 'Open with Default App',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      action: handleOpenFile,
    });
    menuItems.push({
      label: 'Open in VS Code',
      icon: (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      ),
      action: () => handleOpenInEditor('vscode'),
    });
  }

  menuItems.push({
    label: 'Reveal in Finder',
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z"
          stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    action: handleRevealInFinder,
    separator: !node.isDir,
  });

  menuItems.push({
    label: 'Copy Name',
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="1.5" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.5H2.5a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V14" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    action: handleCopyName,
    separator: true,
  });

  menuItems.push({
    label: 'Copy Relative Path',
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="1.5" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.5H2.5a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V14" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    action: handleCopyPath,
  });

  menuItems.push({
    label: 'Copy Full Path',
    icon: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="1.5" width="9" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.5H2.5a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V14" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    action: handleCopyFullPath,
  });

  return (
    <div
      ref={menuRef}
      className="fixed bg-surface border border-border rounded-lg shadow-xl z-[100] py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {menuItems.map((item, i) => (
        <React.Fragment key={i}>
          {item.separator && i > 0 && (
            <div className="border-t border-border my-1" />
          )}
          <button
            onClick={item.action}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover
                       transition-colors"
          >
            <span className="text-text-muted">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Tree Item ───────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  projectPath,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  projectPath: string;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 1);

  const handleClick = () => {
    if (node.isDir) {
      setIsOpen(!isOpen);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className="flex items-center gap-1 w-full text-left hover:bg-surface-hover transition-colors py-[3px] pr-2"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse chevron for directories */}
        {node.isDir ? (
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
          >
            <path d="M3.5 2l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-[10px] shrink-0" />
        )}

        <FileIcon name={node.name} isDir={node.isDir} isOpen={isOpen} />

        <span className="text-xs text-text-secondary truncate font-mono">
          {node.name}
        </span>
      </button>

      {node.isDir && isOpen && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          projectPath={projectPath}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

// ─── File Tree ───────────────────────────────────────────────────────

export function FileTree() {
  const { currentProject } = useAppStore();
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);

  const loadFiles = useCallback(async () => {
    if (!currentProject.path) return;
    setLoading(true);
    try {
      const result = await window.api.git.listFiles(currentProject.path);
      setFiles(result);
    } catch (err) {
      console.error('Failed to list files:', err);
    } finally {
      setLoading(false);
    }
  }, [currentProject.path]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <>
      {/* Search */}
      <div className="px-2 py-2 border-b border-border shrink-0">
        <div className="relative">
          <svg
            width="12" height="12" viewBox="0 0 16 16" fill="none"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter files…"
            className="w-full bg-surface border border-border rounded-md pl-7 pr-2 py-1
                       text-xs text-text-primary placeholder-text-muted
                       outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            Loading files…
          </div>
        ) : tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            {searchQuery ? 'No matching files' : 'No files found'}
          </div>
        ) : (
          <div className="py-1">
            {tree.map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                projectPath={currentProject.path}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: file count */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-muted shrink-0">
        {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
        {searchQuery && ` (filtered from ${files.length})`}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          projectPath={currentProject.path}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
}
