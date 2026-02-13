import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePermissionStore } from '../../stores/permissionStore';
import { useTabStore } from '../../stores/tabStore';
import { useSessions } from '../../hooks/useSessions';
import { MessageBubble } from './MessageBubble';
import { ToolCard } from './ToolCard';
import { PermissionPrompt } from './PermissionPrompt';
import { WelcomeScreen } from './WelcomeScreen';
import { ChatSearch } from './ChatSearch';
import type { AppearanceSettings } from '../../types';

const LAYOUT_CLASS: Record<AppearanceSettings['chatLayout'], string> = {
  'centered-sm': 'max-w-xl mx-auto',       // 576px
  'centered': 'max-w-3xl mx-auto',          // 768px
  'centered-lg': 'max-w-5xl mx-auto',       // 1024px
  'centered-xl': 'max-w-7xl mx-auto',       // 1280px
  'full-width': 'w-full px-2',
};

function getLayoutClass(layout: AppearanceSettings['chatLayout']): string {
  return LAYOUT_CLASS[layout] || LAYOUT_CLASS['centered'];
}

/**
 * Global ref to the chat scroll container.
 * Used by App.tsx to save scroll position before tab switch
 * (before the DOM is torn down by loading state).
 */
export let chatScrollElement: HTMLDivElement | null = null;

export function ChatView() {
  const { currentSession, streamingContent, toolActivities, isLoadingSession } = useAppStore();
  const { settings } = useSettingsStore();
  const { pendingRequests } = usePermissionStore();
  const { forkSession } = useSessions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showSearch, setShowSearch] = useState(false);

  const { messages, isStreaming, id: sessionId } = currentSession;
  const hasMessages = messages.length > 0;
  const pendingScrollRestore = useRef<number | null>(null);
  // Track whether we're in a "just switched tab" state to suppress auto-scroll
  const isRestoringScroll = useRef(false);

  // Keep global ref in sync with scrollRef
  useEffect(() => {
    chatScrollElement = scrollRef.current;
    return () => { chatScrollElement = null; };
  });

  // Only allow fork when we have a saved session (not streaming, has session id)
  const canFork = !!currentSession.id && !isStreaming;

  const handleFork = useCallback((messageId: string) => {
    if (!canFork) return;
    forkSession(messageId);
  }, [canFork, forkSession]);

  // When sessionId changes, check if there's a saved scroll position to restore
  useEffect(() => {
    if (sessionId) {
      const savedPos = useTabStore.getState().getScrollPosition(sessionId);
      if (savedPos !== undefined) {
        pendingScrollRestore.current = savedPos;
        isRestoringScroll.current = true;
      } else {
        pendingScrollRestore.current = null;
        isRestoringScroll.current = false;
      }
    } else {
      pendingScrollRestore.current = null;
      isRestoringScroll.current = false;
    }
  }, [sessionId]);

  // Try to restore scroll position whenever messages change or loading finishes
  useEffect(() => {
    if (pendingScrollRestore.current === null) return;
    if (!scrollRef.current) return;
    if (messages.length === 0) return;
    if (isLoadingSession) return;

    const pos = pendingScrollRestore.current;
    pendingScrollRestore.current = null;

    // Use multiple rAF to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = pos;
          console.log(`[scroll] RESTORED scrollTop=${scrollRef.current.scrollTop}`);
        }
        // Allow auto-scroll again after a short delay
        setTimeout(() => {
          isRestoringScroll.current = false;
        }, 200);
      });
    });
  }, [messages, isLoadingSession]);

  // Auto-scroll to bottom only when streaming (new content arriving), not during tab restore
  useEffect(() => {
    if (isRestoringScroll.current) return;
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, messages.length, streamingContent, toolActivities.length, pendingRequests.length]);

  // Cmd/Ctrl+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoadingSession) {
    return <LoadingSkeleton />;
  }

  if (!hasMessages && !isStreaming) {
    return <WelcomeScreen />;
  }

  const layoutClass = getLayoutClass(settings.appearance.chatLayout);

  return (
    <div className="relative flex-1 min-h-0">
      {showSearch && (
        <ChatSearch
          containerRef={scrollRef}
          onClose={() => setShowSearch(false)}
        />
      )}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 py-4"
      >
      <div className={`${layoutClass} space-y-4`}>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onFork={canFork ? handleFork : undefined}
          />
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

              {/* Thinking indicator when tools are active but no text content yet */}
              {!streamingContent && toolActivities.length > 0 && (
                <div className="flex items-center gap-2 py-1">
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
              )}
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
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────

function LoadingSkeleton() {
  const { settings } = useSettingsStore();
  const layoutClass = getLayoutClass(settings.appearance.chatLayout);

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
