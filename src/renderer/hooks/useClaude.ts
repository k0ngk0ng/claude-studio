import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ClaudeStreamEvent, ContentBlock, Message } from '../types';

function extractTextFromContent(
  content: string | ContentBlock[] | undefined
): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('\n');
}

function extractToolUse(content: string | ContentBlock[] | undefined) {
  if (!content || typeof content === 'string') return [];
  return content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      name: block.name || 'unknown',
      input: block.input || {},
    }));
}

export function useClaude() {
  const {
    currentSession,
    addMessage,
    setIsStreaming,
    setProcessId,
    setStreamingContent,
    appendStreamingContent,
    clearStreamingContent,
    setCurrentSession,
  } = useAppStore();

  const processIdRef = useRef<string | null>(null);
  const messageHandlerRef = useRef<
    ((processId: string, message: ClaudeStreamEvent) => void) | null
  >(null);

  const handleMessage = useCallback(
    (processId: string, event: ClaudeStreamEvent) => {
      if (processId !== processIdRef.current) return;

      switch (event.type) {
        case 'system': {
          // System init message, may contain session_id
          if (event.session_id) {
            setCurrentSession({ id: event.session_id });
          }
          break;
        }

        case 'assistant': {
          // Partial or complete assistant message
          const text = extractTextFromContent(event.message?.content);
          if (text) {
            setStreamingContent(text);
          }
          break;
        }

        case 'result': {
          // Final result
          setIsStreaming(false);
          clearStreamingContent();

          const resultContent = event.result?.content;
          const text = extractTextFromContent(resultContent);
          const toolUse = extractToolUse(resultContent);

          if (text || toolUse.length > 0) {
            const message: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: text,
              timestamp: new Date().toISOString(),
              toolUse: toolUse.length > 0 ? toolUse : undefined,
              model: event.message?.model,
              costUsd: event.result?.cost,
              durationMs: event.result?.duration_ms,
            };
            addMessage(message);
          }

          if (event.result?.session_id) {
            setCurrentSession({ id: event.result.session_id });
          }
          break;
        }

        case 'error': {
          const errorText =
            typeof event.message?.content === 'string'
              ? event.message.content
              : 'An error occurred';
          const errorMsg: Message = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Error: ${errorText}`,
            timestamp: new Date().toISOString(),
          };
          addMessage(errorMsg);
          break;
        }

        case 'exit': {
          setIsStreaming(false);
          clearStreamingContent();
          setProcessId(null);
          break;
        }

        default:
          break;
      }
    },
    [
      addMessage,
      setIsStreaming,
      setProcessId,
      setStreamingContent,
      clearStreamingContent,
      setCurrentSession,
    ]
  );

  // Register/unregister message listener
  useEffect(() => {
    if (messageHandlerRef.current) {
      window.api.claude.removeMessageListener(messageHandlerRef.current as any);
    }
    messageHandlerRef.current = handleMessage as any;
    window.api.claude.onMessage(handleMessage as any);

    return () => {
      if (messageHandlerRef.current) {
        window.api.claude.removeMessageListener(messageHandlerRef.current as any);
        messageHandlerRef.current = null;
      }
    };
  }, [handleMessage]);

  const startSession = useCallback(
    async (cwd: string, sessionId?: string) => {
      // Kill existing process if any
      if (processIdRef.current) {
        await window.api.claude.kill(processIdRef.current);
      }

      const pid = await window.api.claude.spawn(cwd, sessionId);
      processIdRef.current = pid;
      setProcessId(pid);
      setIsStreaming(false);
      return pid;
    },
    [setProcessId, setIsStreaming]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!processIdRef.current) return;

      // Add user message to store
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMessage);
      setIsStreaming(true);
      clearStreamingContent();

      // Send to process
      await window.api.claude.send(processIdRef.current, content);
    },
    [addMessage, setIsStreaming, clearStreamingContent]
  );

  const stopSession = useCallback(async () => {
    if (processIdRef.current) {
      await window.api.claude.kill(processIdRef.current);
      processIdRef.current = null;
      setProcessId(null);
      setIsStreaming(false);
      clearStreamingContent();
    }
  }, [setProcessId, setIsStreaming, clearStreamingContent]);

  return {
    startSession,
    sendMessage,
    stopSession,
    isStreaming: currentSession.isStreaming,
    processId: currentSession.processId,
  };
}
