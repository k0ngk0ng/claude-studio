import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { debugLog } from '../stores/debugLogStore';
import type { ContentBlock, Message } from '../types';

/**
 * Claude CLI stream-json protocol events:
 *
 * Text response:
 *   stream_event/message_start → content_block_start(text) → content_block_delta(text_delta) → assistant → result
 *
 * Tool use:
 *   stream_event/message_start → content_block_start(tool_use, name) → content_block_delta(input_json_delta)
 *   → assistant(tool_use blocks) → content_block_stop → message_delta(stop_reason:tool_use) → message_stop
 *   → user(tool_result) → [new message_start for next turn]
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
      input?: Record<string, unknown>;
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
  tool_use_result?: {
    type?: string;
    file?: { filePath?: string };
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
  const lastResultIdRef = useRef<string | null>(null);
  // Track current tool use block
  const currentToolIdRef = useRef<string | null>(null);
  const toolInputJsonRef = useRef('');
  // Queue for tool results that arrive before the tool activity is added
  const pendingToolResultsRef = useRef<Map<string, { status: 'done'; output: string }>>(new Map());

  useEffect(() => {
    const handler = (processId: string, raw: unknown) => {
      if (processId !== processIdRef.current) return;

      const event = raw as StreamEvent;

      if (event.type !== 'stream_event') {
        debugLog('claude', `event: ${event.type}${event.subtype ? '/' + event.subtype : ''}`, event);
      }

      const {
        addMessage,
        setIsStreaming,
        setProcessId,
        setStreamingContent,
        clearStreamingContent,
        setCurrentSession,
        addToolActivity,
        updateToolActivity,
        clearToolActivities,
      } = useAppStore.getState();

      switch (event.type) {
        case 'system': {
          if (event.session_id) {
            debugLog('claude', `session started: ${event.session_id}`, event);
            setCurrentSession({ id: event.session_id });
            // Trigger sessions reload — a new session may have been created
            // Use a short delay to let the JSONL file be written to disk
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('claude:session-updated'));
            }, 300);
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
              currentToolIdRef.current = null;
              toolInputJsonRef.current = '';
              break;
            }

            case 'content_block_start': {
              if (evt.content_block?.type === 'tool_use') {
                // Tool use starting — track it
                const toolId = evt.content_block.id || `tool-${Date.now()}`;
                const toolName = evt.content_block.name || 'Unknown';
                debugLog('claude', `tool_use start: ${toolName} (${toolId})`);
                currentToolIdRef.current = toolId;
                toolInputJsonRef.current = '';

                // Check if we already have a result queued for this tool
                const pendingResult = pendingToolResultsRef.current.get(toolId);
                if (pendingResult) {
                  pendingToolResultsRef.current.delete(toolId);
                  addToolActivity({
                    id: toolId,
                    name: toolName,
                    status: 'done',
                    output: pendingResult.output,
                    timestamp: Date.now(),
                  });
                } else {
                  addToolActivity({
                    id: toolId,
                    name: toolName,
                    status: 'running',
                    timestamp: Date.now(),
                  });
                }
              }
              break;
            }

            case 'content_block_delta': {
              if (evt.delta?.type === 'text_delta' && evt.delta.text) {
                streamingTextRef.current += evt.delta.text;
                setStreamingContent(streamingTextRef.current);
              } else if (evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
                // Accumulate tool input JSON for display
                toolInputJsonRef.current += evt.delta.partial_json;
                if (currentToolIdRef.current) {
                  const partial = toolInputJsonRef.current;
                  const { toolActivities } = useAppStore.getState();
                  const activity = toolActivities.find(a => a.id === currentToolIdRef.current);
                  if (activity) {
                    // Extract a brief description from common fields
                    const fileMatch = partial.match(/"file_path"\s*:\s*"([^"]+)"/);
                    const cmdMatch = partial.match(/"command"\s*:\s*"([^"]+)"/);
                    const patternMatch = partial.match(/"pattern"\s*:\s*"([^"]+)"/);
                    const urlMatch = partial.match(/"url"\s*:\s*"([^"]+)"/);
                    const promptMatch = partial.match(/"prompt"\s*:\s*"([^"]{0,80})/);
                    const descMatch = partial.match(/"description"\s*:\s*"([^"]{0,80})/);
                    const input = fileMatch?.[1] || cmdMatch?.[1] || patternMatch?.[1]
                      || urlMatch?.[1] || descMatch?.[1] || promptMatch?.[1];
                    const brief = input
                      ? (input.length > 60 ? '…' + input.slice(-57) : input)
                      : undefined;

                    // Always update inputFull, and set brief input once
                    useAppStore.setState({
                      toolActivities: toolActivities.map(a =>
                        a.id === currentToolIdRef.current
                          ? { ...a, inputFull: partial, input: a.input || brief }
                          : a
                      ),
                    });
                  }
                }
              }
              break;
            }

            case 'content_block_stop': {
              // Tool use block finished — keep as running until we get the result
              // Save the final full input
              if (currentToolIdRef.current) {
                const { toolActivities } = useAppStore.getState();
                useAppStore.setState({
                  toolActivities: toolActivities.map(a =>
                    a.id === currentToolIdRef.current
                      ? { ...a, inputFull: toolInputJsonRef.current || a.inputFull }
                      : a
                  ),
                });
                currentToolIdRef.current = null;
                toolInputJsonRef.current = '';
              }
              break;
            }

            case 'message_delta': {
              // stop_reason: "tool_use" means Claude is waiting for tool results
              // stop_reason: "end_turn" means Claude is done
              break;
            }

            case 'message_stop':
              break;

            default:
              break;
          }
          break;
        }

        case 'assistant': {
          // Complete assistant message snapshot
          const text = extractTextFromContent(event.message?.content);
          if (text) {
            streamingTextRef.current = text;
            setStreamingContent(text);
          }
          break;
        }

        case 'user': {
          // Tool result — Claude CLI executed a tool and got results
          const msg = event.message;
          if (msg && Array.isArray(msg.content)) {
            // Collect all tool result updates, then apply in one batch
            const updates = new Map<string, { status: 'done'; output: string }>();

            for (const block of msg.content as any[]) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                // Content can be a string OR an array of {type:"text", text:"..."} blocks
                let resultContent = '';
                if (typeof block.content === 'string') {
                  resultContent = block.content;
                } else if (Array.isArray(block.content)) {
                  resultContent = block.content
                    .filter((b: any) => b.type === 'text' && b.text)
                    .map((b: any) => b.text)
                    .join('\n');
                }
                // Truncate long results for display
                const truncated = resultContent.length > 500
                  ? resultContent.slice(0, 500) + '\n…(truncated)'
                  : resultContent;

                updates.set(block.tool_use_id, {
                  status: 'done' as const,
                  output: truncated || '(completed)',
                });
              }
            }

            if (updates.size > 0) {
              const { toolActivities } = useAppStore.getState();
              const knownIds = new Set(toolActivities.map(a => a.id));
              debugLog('claude', `tool_result: ${updates.size} result(s), known tools: [${[...knownIds].join(', ')}]`, Object.fromEntries(updates));

              // Apply all updates in a single setState
              useAppStore.setState({
                toolActivities: toolActivities.map(a => {
                  const update = updates.get(a.id);
                  return update ? { ...a, ...update } : a;
                }),
              });

              // Queue any results for tools not yet in the activities list
              for (const [toolId, update] of updates) {
                if (!knownIds.has(toolId)) {
                  pendingToolResultsRef.current.set(toolId, update);
                }
              }
            }
          }
          break;
        }

        case 'result': {
          const resultId = (raw as any).uuid || event.session_id || processId;
          if (resultId === lastResultIdRef.current) {
            debugLog('claude', `duplicate result ignored: ${resultId}`);
            break;
          }
          lastResultIdRef.current = resultId;
          debugLog('claude', `result received — cost: $${event.total_cost_usd?.toFixed(4) || '?'}, duration: ${event.duration_ms || '?'}ms`, {
            session_id: event.session_id,
            total_cost_usd: event.total_cost_usd,
            duration_ms: event.duration_ms,
            num_turns: event.num_turns,
          });

          setIsStreaming(false);
          clearStreamingContent();

          // Safety net: mark any still-running tools as done before clearing
          const { toolActivities: remaining } = useAppStore.getState();
          if (remaining.some(a => a.status === 'running')) {
            useAppStore.setState({
              toolActivities: remaining.map(a =>
                a.status === 'running' ? { ...a, status: 'done' as const } : a
              ),
            });
          }
          clearToolActivities();

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
          pendingToolResultsRef.current.clear();

          if (event.session_id) {
            setCurrentSession({ id: event.session_id });
          }

          // Clean up runtime cache for this session
          const sessionKey = event.session_id || useAppStore.getState().currentSession.id;
          if (sessionKey) {
            useAppStore.getState().removeRuntime(sessionKey);
          }

          // Trigger sessions reload so new threads appear in sidebar
          window.dispatchEvent(new CustomEvent('claude:session-updated'));
          break;
        }

        case 'error': {
          setIsStreaming(false);
          clearStreamingContent();
          clearToolActivities();
          pendingToolResultsRef.current.clear();

          const errorText =
            typeof event.message?.content === 'string'
              ? event.message.content
              : 'An error occurred';
          debugLog('claude', `error: ${errorText}`, event, 'error');
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Error: ${errorText}`,
            timestamp: new Date().toISOString(),
          });

          // Clean up runtime cache
          const errSessionKey = useAppStore.getState().currentSession.id;
          if (errSessionKey) {
            useAppStore.getState().removeRuntime(errSessionKey);
          }
          break;
        }

        case 'exit': {
          setIsStreaming(false);
          clearStreamingContent();
          clearToolActivities();
          setProcessId(null);
          pendingToolResultsRef.current.clear();

          // Clean up runtime cache
          const exitSessionKey = useAppStore.getState().currentSession.id;
          if (exitSessionKey) {
            useAppStore.getState().removeRuntime(exitSessionKey);
          }

          processIdRef.current = null;
          streamingTextRef.current = '';
          break;
        }

        case 'raw': {
          debugLog('claude', 'raw output', event.message?.content);
          break;
        }

        default:
          debugLog('claude', `unknown event: ${event.type}`, event);
          break;
      }
    };

    window.api.claude.onMessage(handler);
    return () => {
      window.api.claude.removeMessageListener(handler);
    };
  }, []);

  const startSession = useCallback(
    async (cwd: string, sessionId?: string) => {
      debugLog('claude', `spawning CLI — cwd: ${cwd}${sessionId ? ', resume: ' + sessionId : ''}`, {
        cwd,
        sessionId,
        args: ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...(sessionId ? ['--resume', sessionId] : [])],
      });

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
    debugLog('claude', `sending message: ${content.slice(0, 100)}${content.length > 100 ? '…' : ''}`, { length: content.length });
    const { addMessage, setIsStreaming, clearStreamingContent, clearToolActivities } =
      useAppStore.getState();

    // If no process, need to spawn one first
    const pid = processIdRef.current;
    if (!pid) return;

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });
    setIsStreaming(true);
    clearStreamingContent();
    clearToolActivities();
    streamingTextRef.current = '';
    pendingToolResultsRef.current.clear();

    await window.api.claude.send(pid, content);
  }, []);

  const stopSession = useCallback(async () => {
    if (processIdRef.current) {
      await window.api.claude.kill(processIdRef.current);
      processIdRef.current = null;
      const { setProcessId, setIsStreaming, clearStreamingContent, clearToolActivities } =
        useAppStore.getState();
      setProcessId(null);
      setIsStreaming(false);
      clearStreamingContent();
      clearToolActivities();
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
