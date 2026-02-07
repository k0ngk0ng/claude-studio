import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-3 py-1.5 rounded-lg bg-surface text-text-muted text-xs max-w-lg text-center">
          {message.content}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-user-bubble text-text-primary">
          <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
          <div className="text-[10px] text-text-muted mt-1.5 text-right">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-[14px] leading-relaxed text-text-primary markdown-content ${
            message.isStreaming ? 'streaming-cursor' : ''
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Tool use blocks */}
        {message.toolUse && message.toolUse.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolUse.map((tool, idx) => (
              <ToolUseBlock key={idx} name={tool.name} input={tool.input} result={tool.result} />
            ))}
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
        </div>
      </div>
    </div>
  );
}

function ToolUseBlock({
  name,
  input,
  result,
}: {
  name: string;
  input: Record<string, unknown>;
  result?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left
                   hover:bg-surface-hover transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-150 ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          <path
            d="M4.5 2.5l3.5 3.5-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 3l-3 5 3 5h4l3-5-3-5H6z"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-accent"
          />
        </svg>
        <span className="text-xs font-medium text-text-secondary">{name}</span>
      </button>

      {expanded && (
        <div className="px-3 py-2 border-t border-border bg-bg">
          <pre className="text-xs text-text-secondary overflow-x-auto font-mono">
            {JSON.stringify(input, null, 2)}
          </pre>
          {result && (
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-[10px] text-text-muted mb-1 uppercase tracking-wider">
                Result
              </div>
              <pre className="text-xs text-text-secondary overflow-x-auto font-mono whitespace-pre-wrap">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
