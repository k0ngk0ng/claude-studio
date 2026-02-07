import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ContentBlock, Message } from '../types';

/**
 * Claude CLI stream-json protocol events:
 *
 * 1. {"type":"system","subtype":"init","session_id":"...","tools":[...],...}
 * 2. {"type":"stream_event","event":{"type":"message_start","message":{...}}}
 * 3. {"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"text",...}}}
 * 4. {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 *    (repeated for each token)
 * 5. {"type":"assistant","message":{"content":[{"text":"full text","type":"text"}],...}}
 *    (complete assistant message snapshot — sent with --include-partial-messages)
 * 6. {"type":"stream_event","event":{"type":"content_block_stop"}}
 * 7. {"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn",...}}}
 * 8. {"type":"stream_event","event":{"type":"message_stop"}}
 * 9. {"type":"result","subtype":"success","result":"full text","total_cost_usd":...,"session_id":"..."}
 */

interface StreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  event?: {
    type: string;
    message?: {
      id?: string;
      model?: string;
      role?: string;
      content?: ContentBlock[];
      stop_reason?: string | null;
      usage?: Record<string, number>;
    };
    content_block?: {
      type: string;
      text?: string;
      name?: string;
      id?: string;
    };
    delta?: {
      type?: string;
      text?: string;
      stop_reason?: string;
      partial_json?: string;
    };
    index?: number;
  };
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    stop_reason?: string | null;
  };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  code?: number;
  signal?: string;
}

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

export function useClaude() {
  const store = useAppStore();
  const processIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef('');
  const currentModelRef = useRef<string | undefined>(undefined);

  // Use a single stable handler registered ONCE — reads store actions via getState()
  useEffect(() => {
    const handler = (processId: string, raw: unknown) => {
      if (processId !== processIdRef.current) return;

      const event = raw as StreamEvent;
      const {
        addMessage,
        setIsStreaming,
        setProcessId,
        setStreamingContent,
        clearStreamingContent,
        setCurrentSession,
      } = useAppStore.getState();

      switch (event.type) {
        case 'system': {
          if (event.session_id) {
            setCurrentSession({ id: event.session_id });
          }
          break;
        }

        case 'stream_event': {
          const evt = event.event;
          if (!evt) break;

          switch (evt.type) {
            case 'message_start': {
              streamingTextRef.current = '';
              currentModelRef.current = evt.message?.model;
              break;
            }

            case 'content_block_delta': {
              if (evt.delta?.type === 'text_delta' && evt.delta.text) {
                streamingTextRef.current += evt.delta.text;
                setStreamingContent(streamingTextRef.current);
              }
              break;
            }

            case 'content_block_start':
            case 'content_block_stop':
            case 'message_delta':
            case 'message_stop':
              break;

            default:
              break;
          }
          break;
        }

        case 'assistant': {
          const text = extractTextFromContent(event.message?.content);
          if (text) {
            streamingTextRef.current = text;
            setStreamingContent(text);
          }
          break;
        }

        case 'result': {
          setIsStreaming(false);
          clearStreamingContent();

          const resultText = typeof event.result === 'string'
            ? event.result
            : streamingTextRef.current;

          if (resultText) {
            const message: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: resultText,
              timestamp: new Date().toISOString(),
              model: currentModelRef.current,
              costUsd: event.total_cost_usd,
              durationMs: event.duration_ms,
            };
            addMessage(message);
          }

          streamingTextRef.current = '';
          currentModelRef.current = undefined;

          if (event.session_id) {
            setCurrentSession({ id: event.session_id });
          }
          break;
        }

        case 'error': {
          setIsStreaming(false);
          clearStreamingContent();

          const errorText =
            typeof event.message?.content === 'string'
              ? event.message.content
              : 'An error occurred';
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Error: ${errorText}`,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case 'exit': {
          setIsStreaming(false);
          clearStreamingContent();
          setProcessId(null);
          processIdRef.current = null;
          streamingTextRef.current = '';
          break;
        }

        case 'raw': {
          console.log('[claude raw]', event.message?.content);
          break;
        }

        default:
          console.log('[claude event]', event.type, event);
          break;
      }
    };

    window.api.claude.onMessage(handler);
    return () => {
      window.api.claude.removeMessageListener(handler);
    };
  }, []); // Empty deps — handler is stable, reads from refs and getState()

  const startSession = useCallback(
    async (cwd: string, sessionId?: string) => {
      if (processIdRef.current) {
        await window.api.claude.kill(processIdRef.current);
        processIdRef.current = null;
      }

      streamingTextRef.current = '';
      currentModelRef.current = undefined;

      const pid = await window.api.claude.spawn(cwd, sessionId);
      processIdRef.current = pid;
      useAppStore.getState().setProcessId(pid);
      useAppStore.getState().setIsStreaming(false);
      return pid;
    },
    []
  );

  const sendMessage = useCallback(async (content: string) => {
    const pid = processIdRef.current;
    if (!pid) return;

    const { addMessage, setIsStreaming, clearStreamingContent } =
      useAppStore.getState();

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });
    setIsStreaming(true);
    clearStreamingContent();
    streamingTextRef.current = '';

    await window.api.claude.send(pid, content);
  }, []);

  const stopSession = useCallback(async () => {
    if (processIdRef.current) {
      await window.api.claude.kill(processIdRef.current);
      processIdRef.current = null;
      const { setProcessId, setIsStreaming, clearStreamingContent } =
        useAppStore.getState();
      setProcessId(null);
      setIsStreaming(false);
      clearStreamingContent();
      streamingTextRef.current = '';
    }
  }, []);

  return {
    startSession,
    sendMessage,
    stopSession,
    isStreaming: store.currentSession.isStreaming,
    processId: store.currentSession.processId,
  };
}
