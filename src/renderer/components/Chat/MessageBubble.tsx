import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Message, StreamingCursorStyle } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { ToolCard } from './ToolCard';

/* ── Streaming cursor styles ─────────────────────────────────────── */

function PulseDotCursor() {
  return (
    <span className="inline-flex items-center ml-1.5 align-middle" aria-hidden="true">
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-accent opacity-40 animate-ping" />
        <span className="relative rounded-full h-2 w-2 bg-accent shadow-[0_0_6px_var(--color-accent)]" />
      </span>
    </span>
  );
}

function TerminalCursor() {
  return (
    <span className="inline-block ml-0.5 align-baseline terminal-cursor" aria-hidden="true">
      _
    </span>
  );
}

function ScanLineCursor() {
  return (
    <span className="inline-block ml-1 align-middle scan-line-cursor" aria-hidden="true">
      <span className="inline-block w-4 h-[14px] relative overflow-hidden rounded-sm">
        <span className="absolute inset-0 bg-accent/10" />
        <span className="absolute left-0 w-full h-[2px] bg-accent shadow-[0_0_6px_var(--color-accent)] scan-line-bar" />
      </span>
    </span>
  );
}

function ClassicCursor() {
  return (
    <span className="inline-block ml-0.5 align-baseline classic-cursor" aria-hidden="true">
      │
    </span>
  );
}

const TYPEWRITER_CHARS = '|/-\\';

function TypewriterCursor() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % TYPEWRITER_CHARS.length), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-block ml-0.5 font-mono text-accent align-baseline typewriter-cursor" aria-hidden="true">
      {TYPEWRITER_CHARS[idx]}
    </span>
  );
}

function DnaHelixCursor() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center ml-1 gap-[2px] align-middle" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
          style={{
            transform: `translateY(${Math.sin((tick + i * 4) * 0.3) * 4}px)`,
            opacity: 0.5 + Math.sin((tick + i * 4) * 0.3) * 0.5,
          }}
        />
      ))}
    </span>
  );
}

function HeartbeatCursor() {
  return (
    <span className="inline-flex items-center ml-1 align-middle" aria-hidden="true">
      <svg width="24" height="14" viewBox="0 0 24 14" fill="none" className="heartbeat-line">
        <polyline
          points="0,7 4,7 6,2 8,12 10,4 12,9 14,7 24,7"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

function NeonFlickerCursor() {
  const [brightness, setBrightness] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setBrightness(Math.random() > 0.3 ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="inline-block ml-0.5 font-mono align-baseline"
      style={{
        color: 'var(--color-accent)',
        opacity: brightness,
        textShadow: `0 0 ${4 + brightness * 8}px var(--color-accent), 0 0 ${brightness * 16}px var(--color-accent)`,
      }}
      aria-hidden="true"
    >
      ▍
    </span>
  );
}

const CURSOR_MAP: Record<StreamingCursorStyle, React.FC> = {
  'pulse-dot': PulseDotCursor,
  'terminal': TerminalCursor,
  'scan-line': ScanLineCursor,
  'classic': ClassicCursor,
  'typewriter': TypewriterCursor,
  'dna-helix': DnaHelixCursor,
  'heartbeat': HeartbeatCursor,
  'neon-flicker': NeonFlickerCursor,
};

export function StreamingCursor({ style }: { style?: StreamingCursorStyle }) {
  const settingStyle = useSettingsStore((s) => s.settings.appearance.streamingCursor);
  const Comp = CURSOR_MAP[style || settingStyle] || PulseDotCursor;
  return <Comp />;
}

/* ── Code block copy button ──────────────────────────────────────── */

function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 p-1 rounded bg-surface-hover/80 hover:bg-surface-hover
                 text-text-muted hover:text-text-primary opacity-0 group-hover/code:opacity-100
                 transition-opacity"
      title="Copy code"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as React.ReactElement).props.children);
  }
  return '';
}

/* ── Link context menu (Open Link / Copy Link) ─────────────────────── */

interface LinkMenuState {
  x: number;
  y: number;
  href: string;
}

function LinkContextMenu({ menu, onClose }: { menu: LinkMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(menu.x, window.innerWidth - 180),
    top: Math.min(menu.y, window.innerHeight - 80),
    zIndex: 9999,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[160px] py-1 rounded-lg bg-surface border border-border shadow-lg"
    >
      <button
        className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        onClick={() => {
          window.api.app.openExternal(menu.href);
          onClose();
        }}
      >
        Open Link
      </button>
      <button
        className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        onClick={() => {
          navigator.clipboard.writeText(menu.href);
          onClose();
        }}
      >
        Copy Link
      </button>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  hideAvatar?: boolean;
  onFork?: (messageId: string) => void;
}

export function MessageBubble({ message, hideAvatar, onFork }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';
  const showLineNumbers = useSettingsStore((s) => s.settings.appearance.showLineNumbers);

  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);
  const closeLinkMenu = useCallback(() => setLinkMenu(null), []);

  /* Custom <a> renderer: left-click opens in browser, right-click shows menu */
  const markdownComponents = React.useMemo(() => ({
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        {...props}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href) window.api.app.openExternal(href);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (href) setLinkMenu({ x: e.clientX, y: e.clientY, href });
        }}
      >
        {children}
      </a>
    ),
    pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
      const code = extractTextFromChildren(children).replace(/\n$/, '');
      const lines = code.split('\n');
      return (
        <div className="relative group/code">
          {showLineNumbers ? (
            <pre {...props} className={`${props.className || ''} !flex`}>
              <span
                className="select-none text-right pr-3 pl-1 text-text-muted/40 border-r border-border/50 shrink-0"
                aria-hidden="true"
              >
                {lines.map((_, i) => (
                  <span key={i} className="block">{i + 1}</span>
                ))}
              </span>
              <span className="flex-1 overflow-x-auto pl-3">
                {children}
              </span>
            </pre>
          ) : (
            <pre {...props}>
              {children}
            </pre>
          )}
          <CodeBlockCopyButton code={code} />
        </div>
      );
    },
  }), [showLineNumbers]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-3 py-1.5 rounded-lg bg-surface text-text-muted text-xs max-w-lg text-center">
          {message.content}
        </div>
      </div>
    );
  }

  const [copied, setCopied] = useState(false);

  const copyButton = message.content && (
    <button
      onClick={() => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded
                 hover:bg-surface-hover text-text-muted hover:text-text-primary"
      title="Copy text"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  const forkButton = onFork && (
    <button
      onClick={() => onFork(message.id)}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded
                 hover:bg-surface-hover text-text-muted hover:text-text-primary"
      title="Fork thread from here"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 5v6M5 7.5c0-2 6-2 6-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );

  if (isUser) {
    return (
      <div className="group">
        <div className="flex justify-end">
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-user-bubble text-text-primary">
            <div className="text-[length:var(--ui-font-size,14px)] leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        </div>
        {/* Metadata row — outside the bubble, right-aligned */}
        <div className="flex items-center justify-end gap-3 mt-1.5 text-[10px] text-text-muted">
          {copyButton}
          {forkButton}
          <span>{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className={`flex items-start ${hideAvatar ? '' : 'gap-3'} group`}>
      {/* Avatar */}
      {!hideAvatar && (
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {message.content && (
          <div
            className="text-[length:var(--ui-font-size,14px)] leading-relaxed text-text-primary markdown-content"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && <StreamingCursor />}
            {linkMenu && <LinkContextMenu menu={linkMenu} onClose={closeLinkMenu} />}
          </div>
        )}

        {/* Tool use blocks — same card style as live streaming */}
        {message.toolUse && message.toolUse.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolUse.map((tool, idx) => {
              // Extract a brief input description from common fields
              const input = tool.input;
              const brief =
                (input.file_path as string) ||
                (input.command as string) ||
                (input.pattern as string) ||
                (input.url as string) ||
                (input.description as string) ||
                undefined;
              const briefTruncated = brief
                ? brief.length > 60
                  ? '…' + brief.slice(-57)
                  : brief
                : undefined;

              return (
                <ToolCard
                  key={idx}
                  name={tool.name}
                  input={briefTruncated}
                  inputFull={JSON.stringify(input)}
                  output={tool.result}
                  status="done"
                />
              );
            })}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
          <span>{formatTime(message.timestamp)}</span>
          {message.model && (
            <span className="opacity-60">{message.model}</span>
          )}
          {message.costUsd !== undefined && (
            <span className="opacity-60">
              ${message.costUsd.toFixed(4)}
            </span>
          )}
          {message.durationMs !== undefined && (
            <span className="opacity-60">
              {(message.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {copyButton}
          {forkButton}
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isToday) {
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // Not today — show full date + time
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }) + ' ' + date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
