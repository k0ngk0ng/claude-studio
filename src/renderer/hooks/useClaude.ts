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
 *
 * For tool use:
 * - content_block_start with type:"tool_use", name:"ToolName"
 * - content_block_delta with type:"input_json_delta"
 * - assistant message with tool_use blocks
 * - result may contain tool results
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
    clearStreamingContent,
    setCurrentSession,
  } = useAppStore();

  const processIdRef = useRef<string | null>(null);
  // Accumulate streaming text from deltas
  const streamingTextRef = useRef('');
  // Track model from message_start
  const currentModelRef = useRef<string | undefined>(undefined);

  const handleMessage = useCallback(
    (processId: string, event: StreamEvent) => {
      if (processId !== processIdRef.current) return;

      switch (event.type) {
        case 'system': {
          // System init message — contains session_id, tools, model info
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
              // New assistant message starting — reset accumulator
              streamingTextRef.current = '';
              currentModelRef.current = evt.message?.model;
              break;
            }

            case 'content_block_start': {
              // A new content block is starting (text or tool_use)
              // Nothing to do yet for text blocks
              break;
            }

            case 'content_block_delta': {
              // Streaming text delta — accumulate and display
              if (evt.delta?.type === 'text_delta' && evt.delta.text) {
                streamingTextRef.current += evt.delta.text;
                setStreamingContent(streamingTextRef.current);
              }
              break;
            }

            case 'content_block_stop': {
              // Content block finished
              break;
            }

            case 'message_delta': {
              // Message is finishing (stop_reason available)
              break;
            }

            case 'message_stop': {
              // Message fully complete — the 'assistant' or 'result' event follows
              break;
            }

            default:
              break;
          }
          break;
        }

        case 'assistant': {
          // Complete assistant message snapshot (from --include-partial-messages)
          // Update streaming content with the full text
          const text = extractTextFromContent(event.message?.content);
          if (text) {
            streamingTextRef.current = text;
            setStreamingContent(text);
          }
          break;
        }

        case 'result': {
          // Final result — conversation turn is complete
          setIsStreaming(false);
          clearStreamingContent();

          // The result text is at event.result (string), not event.result.content
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

          // Reset
          streamingTextRef.current = '';
          currentModelRef.current = undefined;

          if (event.session_id) {
            setCurrentSession({ id: event.session_id });
          }

          // Process exits after result in --print mode
          // processId will be cleaned up by the 'exit' event
          break;
        }

        case 'error': {
          setIsStreaming(false);
          clearStreamingContent();

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
          processIdRef.current = null;
          streamingTextRef.current = '';
          break;
        }

        case 'raw': {
          // Non-JSON output from CLI (e.g. warnings)
          console.log('[claude raw]', event.message?.content);
          break;
        }

        default:
          // Unknown event type — log for debugging
          console.log('[claude event]', event.type, event);
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
    const handler = (processId: string, message: unknown) => {
      handleMessage(processId, message as StreamEvent);
    };

    window.api.claude.onMessage(handler);

    return () => {
      window.api.claude.removeMessageListener(handler);
    };
  }, [handleMessage]);

  const startSession = useCallback(
    async (cwd: string, sessionId?: string) => {
      // Kill existing process if any
      if (processIdRef.current) {
        await window.api.claude.kill(processIdRef.current);
        processIdRef.current = null;
      }

      // Reset streaming state
      streamingTextRef.current = '';
      currentModelRef.current = undefined;

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
      const pid = processIdRef.current;
      if (!pid) return;

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
      streamingTextRef.current = '';

      // Send to process
      await window.api.claude.send(pid, content);
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
      streamingTextRef.current = '';
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
