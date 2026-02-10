import React, { useEffect, useMemo } from 'react';
import { html as diff2htmlHtml } from 'diff2html';

interface DiffViewerModalProps {
  filePath: string;
  diff: string;
  onClose: () => void;
}

export function DiffViewerModal({ filePath, diff, onClose }: DiffViewerModalProps) {
  const fileName = filePath.split('/').pop() || filePath;

  const htmlContent = useMemo(() => {
    if (!diff) return '';
    try {
      return diff2htmlHtml(diff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: 'side-by-side',
        colorScheme: 'dark' as any,
      });
    } catch {
      return '';
    }
  }, [diff]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 top-12 z-50 flex flex-col bg-bg" onClick={onClose}>
      <div
        className="flex flex-col w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-text-muted">
              <circle cx="4.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="11.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="4.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 5.5v5M11.5 5.5C11.5 8.5 4.5 7 4.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium text-text-primary truncate">{fileName}</span>
            <span className="text-xs text-text-muted truncate">{filePath}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto min-h-0 diff-viewer-modal">
          {htmlContent ? (
            <div
              className="diff-view-container h-full"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              No diff available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
