import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { MessageBubble } from './MessageBubble';
import { WelcomeScreen } from './WelcomeScreen';

export function ChatView() {
  const { currentSession, streamingContent } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming } = currentSession;
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamingContent]);

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

        {/* Streaming content */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            }}
          />
        )}

        {/* Streaming indicator when no content yet */}
        {isStreaming && !streamingContent && (
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
