import React, { useEffect, useRef, useState } from 'react';
import { useDebugLogStore, type LogCategory } from '../../stores/debugLogStore';

const CATEGORIES: { id: LogCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'claude', label: 'Claude' },
  { id: 'session', label: 'Session' },
  { id: 'git', label: 'Git' },
  { id: 'app', label: 'App' },
  { id: 'error', label: 'Errors' },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

const levelColors: Record<string, string> = {
  info: 'text-text-secondary',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const categoryColors: Record<string, string> = {
  claude: 'text-accent',
  session: 'text-blue-400',
  git: 'text-green-400',
  app: 'text-purple-400',
  error: 'text-red-400',
};

export function LogPanel() {
  const { logs, filter, setFilter, clearLogs } = useDebugLogStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = filter === 'all'
    ? logs
    : filter === 'error'
      ? logs.filter(l => l.level === 'error')
      : logs.filter(l => l.category === filter);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs.length, autoScroll]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-surface shrink-0">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors
              ${filter === cat.id
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
          >
            {cat.label}
            {cat.id === 'error' && (
              <span className="ml-1 text-[10px]">
                {logs.filter(l => l.level === 'error').length || ''}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-1.5 py-0.5 rounded text-[11px] transition-colors
            ${autoScroll ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
          title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M3 7l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Clear */}
        <button
          onClick={clearLogs}
          className="px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
          title="Clear logs"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 3h8M4.5 3V2h3v1M3 3v7a1 1 0 001 1h4a1 1 0 001-1V3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </button>

        <span className="text-[10px] text-text-muted ml-1">
          {filteredLogs.length}
        </span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-[18px]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
          if (atBottom !== autoScroll) setAutoScroll(atBottom);
        }}
      >
        {filteredLogs.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted text-xs">
            {logs.length === 0 ? 'No debug logs yet. Enable debug mode in Settings → General.' : 'No logs match this filter.'}
          </div>
        )}

        {filteredLogs.map(log => {
          const isExpanded = expandedIds.has(log.id);
          return (
            <div
              key={log.id}
              className={`flex flex-col border-b border-border/30 hover:bg-surface-hover/50
                ${log.level === 'error' ? 'bg-red-500/5' : ''}`}
            >
              <div
                className="flex items-start gap-2 px-2 py-0.5 cursor-pointer select-none"
                onClick={() => log.detail && toggleExpand(log.id)}
              >
                {/* Timestamp */}
                <span className="text-text-muted shrink-0 w-[85px]">
                  {formatTime(log.timestamp)}
                </span>

                {/* Category badge */}
                <span className={`shrink-0 w-[52px] font-semibold ${categoryColors[log.category] || 'text-text-muted'}`}>
                  {log.category}
                </span>

                {/* Message */}
                <span className={`flex-1 min-w-0 break-all ${levelColors[log.level]}`}>
                  {log.message}
                </span>

                {/* Expand indicator */}
                {log.detail && (
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className={`shrink-0 mt-1 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && log.detail && (
                <pre className="px-2 py-1 ml-[141px] mr-2 mb-1 text-[10px] leading-[15px]
                  bg-surface rounded text-text-muted overflow-x-auto max-h-[300px] whitespace-pre-wrap break-all">
                  {log.detail}
                </pre>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
