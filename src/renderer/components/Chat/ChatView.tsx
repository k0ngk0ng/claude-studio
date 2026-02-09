import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePermissionStore } from '../../stores/permissionStore';
import { MessageBubble } from './MessageBubble';
import { ToolCard } from './ToolCard';
import { PermissionPrompt } from './PermissionPrompt';
import { WelcomeScreen } from './WelcomeScreen';

export function ChatView() {
  const { currentSession, streamingContent, toolActivities, isLoadingSession } = useAppStore();
  const { settings } = useSettingsStore();
  const { pendingRequests } = usePermissionStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming } = currentSession;
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom on new messages, streaming content, tool activities, or permission requests
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamingContent, toolActivities.length, pendingRequests.length]);

  if (isLoadingSession) {
    return <LoadingSkeleton />;
  }

  if (!hasMessages && !isStreaming) {
    return <WelcomeScreen />;
  }

  const isFullWidth = settings.appearance.chatLayout === 'full-width';
  const layoutClass = isFullWidth ? 'w-full px-2' : 'max-w-3xl mx-auto';

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      <div className={`${layoutClass} space-y-4`}>
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
                <ToolCard
                  key={activity.id}
                  name={activity.name}
                  input={activity.input}
                  inputFull={activity.inputFull}
                  output={activity.output}
                  status={activity.status}
                />
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

        {/* Permission prompts */}
        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <PermissionPrompt key={request.id} request={request} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────

function LoadingSkeleton() {
  const { settings } = useSettingsStore();
  const isFullWidth = settings.appearance.chatLayout === 'full-width';
  const layoutClass = isFullWidth ? 'w-full px-2' : 'max-w-3xl mx-auto';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className={`${layoutClass} space-y-6`}>
        {/* Simulated user message skeleton */}
        <div className="flex justify-end">
          <div className="max-w-[60%] space-y-2">
            <div className="h-4 bg-surface rounded-lg animate-pulse w-48 ml-auto" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-32 ml-auto" />
          </div>
        </div>

        {/* Simulated assistant message skeleton */}
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface animate-pulse shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 bg-surface rounded-lg animate-pulse w-full" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-5/6" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-4/6" />
            {/* Tool card skeleton */}
            <div className="h-10 bg-surface rounded-lg animate-pulse w-72 mt-3" />
          </div>
        </div>

        {/* Another user message skeleton */}
        <div className="flex justify-end">
          <div className="max-w-[60%] space-y-2">
            <div className="h-4 bg-surface rounded-lg animate-pulse w-40 ml-auto" />
          </div>
        </div>

        {/* Another assistant skeleton */}
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface animate-pulse shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 bg-surface rounded-lg animate-pulse w-full" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-3/4" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-5/6" />
            <div className="h-4 bg-surface rounded-lg animate-pulse w-2/3" />
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex justify-center pt-4">
          <div className="flex items-center gap-2 text-text-muted">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" className="text-border" />
              <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
            </svg>
            <span className="text-sm">Loading conversation…</span>
          </div>
        </div>
      </div>
    </div>
  );
}
