import React, { useMemo } from 'react';
import { html as diff2htmlHtml } from 'diff2html';

interface DiffViewProps {
  diff: string;
}

export function DiffView({ diff }: DiffViewProps) {
  const htmlContent = useMemo(() => {
    if (!diff) return '';
    try {
      return diff2htmlHtml(diff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: 'line-by-line',
        colorScheme: 'dark' as any,
      });
    } catch {
      // Fallback to raw diff display
      return '';
    }
  }, [diff]);

  if (!diff) {
    return (
      <div className="px-4 py-3 text-xs text-text-muted">
        No diff available
      </div>
    );
  }

  if (htmlContent) {
    return (
      <div
        className="border-t border-border bg-bg overflow-x-auto max-h-[300px] overflow-y-auto"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    );
  }

  // Fallback: render raw diff with basic coloring
  return (
    <div className="border-t border-border bg-bg overflow-x-auto max-h-[300px] overflow-y-auto">
      <pre className="text-xs font-mono p-3 leading-relaxed">
        {diff.split('\n').map((line, i) => {
          let className = 'text-text-secondary';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            className = 'text-success bg-success/10';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            className = 'text-error bg-error/10';
          } else if (line.startsWith('@@')) {
            className = 'text-info';
          } else if (line.startsWith('diff') || line.startsWith('index')) {
            className = 'text-text-muted';
          }

          return (
            <div key={i} className={`${className} px-1`}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
