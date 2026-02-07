import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { ToolActivity } from '../../stores/appStore';
import { MessageBubble } from './MessageBubble';
import { WelcomeScreen } from './WelcomeScreen';

export function ChatView() {
  const { currentSession, streamingContent, toolActivities } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming } = currentSession;
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom on new messages, streaming content, or tool activities
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamingContent, toolActivities.length]);

  if (!hasMessages && !isStreaming) {
    return <WelcomeScreen />;
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming assistant message with tool activities inline */}
        {isStreaming && (streamingContent || toolActivities.length > 0) && (
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
            <div className="flex-1 min-w-0 space-y-2">
              {/* Streaming text content */}
              {streamingContent && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingContent,
                    timestamp: new Date().toISOString(),
                    isStreaming: true,
                  }}
                  hideAvatar
                />
              )}

              {/* Tool activity cards */}
              {toolActivities.map((activity) => (
                <ToolActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        )}

        {/* Streaming indicator when no content and no tools yet */}
        {isStreaming && !streamingContent && toolActivities.length === 0 && (
          <div className="flex items-start gap-3">
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
            <div className="flex items-center gap-2 py-2">
              <div className="flex gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="text-sm text-text-muted">Claude is thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Tool Activity Card (matches Claude Code CLI style) ─────────────

function ToolActivityCard({ activity }: { activity: ToolActivity }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = activity.status === 'running';

  return (
    <div
      className="rounded-lg bg-surface border border-border overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left
                   hover:bg-surface-hover transition-colors"
      >
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-text-muted transition-transform duration-150 ${
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

        {/* Spinner / checkmark */}
        {isRunning ? (
          <div className="w-4 h-4 shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-border"
              />
              <path
                d="M14 8a6 6 0 00-6-6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="text-accent"
              />
            </svg>
          </div>
        ) : (
          <div className="w-4 h-4 shrink-0 text-accent">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M5.5 8l2 2 3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Tool name */}
        <span className="text-[13px] text-text-primary font-medium">
          {activity.name}
        </span>

        {/* Brief input (shown inline when collapsed) */}
        {!expanded && activity.input && (
          <span className="text-xs text-text-muted font-mono truncate ml-1">
            {activity.input}
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && activity.input && (
        <div className="px-3 pb-2.5 pt-0 ml-[52px]">
          <code className="text-xs text-text-muted font-mono break-all">
            {activity.input}
          </code>
        </div>
      )}
    </div>
  );
}
