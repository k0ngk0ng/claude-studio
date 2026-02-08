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

          // Log non-delta stream events for debugging
          if (evt.type !== 'content_block_delta') {
            debugLog('claude', `stream: ${evt.type}${evt.delta?.stop_reason ? ' (stop_reason=' + evt.delta.stop_reason + ')' : ''}${evt.content_block?.type ? ' [' + evt.content_block.type + (evt.content_block.name ? ':' + evt.content_block.name : '') + ']' : ''}`);
          }

          switch (evt.type) {
            case 'message_start': {
              // New turn starting — clear completed tools from previous turn
              const { toolActivities: prevTools } = useAppStore.getState();
              if (prevTools.length > 0) {
                const stillRunning = prevTools.filter(a => a.status === 'running');
                if (stillRunning.length < prevTools.length) {
                  debugLog('claude', `message_start: clearing ${prevTools.length - stillRunning.length} completed tools, keeping ${stillRunning.length} running`);
                  useAppStore.setState({ toolActivities: stillRunning });
                }
              }
              streamingTextRef.current = '';
              currentModelRef.current = evt.message?.model || currentModelRef.current;
              currentToolIdRef.current = null;
              toolInputJsonRef.current = '';
              break;
            }

            case 'content_block_start': {
              if (evt.content_block?.type === 'tool_use') {
                // Tool use starting — track it
                const toolId = evt.content_block.id || `tool-${Date.now()}`;
                const toolName = evt.content_block.name || 'Unknown';
                currentToolIdRef.current = toolId;
                toolInputJsonRef.current = '';

                // Deduplicate: don't add if this tool already exists
                const { toolActivities: existing } = useAppStore.getState();
                if (existing.some(a => a.id === toolId)) {
                  debugLog('claude', `tool_use start (dup skipped): ${toolName} (${toolId})`);
                  break;
                }

                debugLog('claude', `tool_use start: ${toolName} (${toolId})`);

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
              // stop_reason: "tool_use" means Claude finished generating tool calls,
              // CLI will now execute them. Mark all running tools as "done" (sent to CLI).
              // stop_reason: "end_turn" means Claude is done with this turn.
              if (evt.delta?.stop_reason === 'tool_use') {
                const { toolActivities } = useAppStore.getState();
                const running = toolActivities.filter(a => a.status === 'running');
                if (running.length > 0) {
                  debugLog('claude', `message_delta stop_reason=tool_use: marking ${running.length} tool(s) as done`);
                  useAppStore.setState({
                    toolActivities: toolActivities.map(a =>
                      a.status === 'running' ? { ...a, status: 'done' as const } : a
                    ),
                  });
                }
              }
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
          // Complete assistant message snapshot — contains both text and tool_use blocks
          // With --include-partial-messages, this fires multiple times with cumulative content
          // across ALL turns. We must NOT overwrite streamingTextRef if we're actively
          // accumulating deltas, as the snapshot includes text from previous turns too.
          const content = event.message?.content;
          const text = extractTextFromContent(content);

          // Only use assistant snapshot text if we haven't received any deltas yet
          // for this turn (streamingTextRef is empty). Otherwise deltas are the
          // source of truth.
          if (text && !streamingTextRef.current) {
            streamingTextRef.current = text;
            setStreamingContent(text);
          }

          // Mark any tool_use blocks in this snapshot as done
          if (Array.isArray(content)) {
            const toolUseIds: string[] = [];
            for (const block of content) {
              if (block.type === 'tool_use' && (block as any).id) {
                toolUseIds.push((block as any).id);
              }
            }
            if (toolUseIds.length > 0) {
              const { toolActivities } = useAppStore.getState();
              const runningToolIds = new Set(toolActivities.filter(a => a.status === 'running').map(a => a.id));
              const toMark = toolUseIds.filter(id => runningToolIds.has(id));
              if (toMark.length > 0) {
                debugLog('claude', `assistant snapshot: marking ${toMark.length} tool(s) as done`);
                useAppStore.setState({
                  toolActivities: toolActivities.map(a =>
                    toMark.includes(a.id) ? { ...a, status: 'done' as const } : a
                  ),
                });
              }
            }
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
              const matchedCount = [...updates.keys()].filter(id => knownIds.has(id)).length;
              debugLog('claude', `tool_result: ${updates.size} result(s), matched ${matchedCount}/${toolActivities.length} known tools, ids: [${[...updates.keys()].join(', ')}]`, Object.fromEntries(updates));

              if (toolActivities.length > 0) {
                // Apply all updates in a single setState
                useAppStore.setState({
                  toolActivities: toolActivities.map(a => {
                    const update = updates.get(a.id);
                    return update ? { ...a, ...update } : a;
                  }),
                });
              }

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

          const resultText = typeof event.result === 'string'
            ? event.result
            : streamingTextRef.current;

          debugLog('claude', `result received — cost: $${event.total_cost_usd?.toFixed(4) || '?'}, duration: ${event.duration_ms || '?'}ms, text length: ${resultText?.length || 0}, event.result type: ${typeof event.result}`, {
            session_id: event.session_id,
            total_cost_usd: event.total_cost_usd,
            duration_ms: event.duration_ms,
            num_turns: event.num_turns,
            hasEventResult: event.result !== undefined,
            hasStreamingText: streamingTextRef.current.length > 0,
            resultPreview: resultText ? resultText.slice(0, 200) : '(empty)',
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
          } else {
            debugLog('claude', 'result had no text — no message added', undefined, 'warn');
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
    async (cwd: string, sessionId?: string, permissionMode?: string) => {
      const mode = permissionMode || 'default';
      debugLog('claude', `spawning CLI — cwd: ${cwd}${sessionId ? ', resume: ' + sessionId : ''}, mode: ${mode}`, {
        cwd,
        sessionId,
        permissionMode: mode,
        args: ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', mode, ...(sessionId ? ['--resume', sessionId] : [])],
      });

      if (processIdRef.current) {
        await window.api.claude.kill(processIdRef.current);
        processIdRef.current = null;
      }

      streamingTextRef.current = '';
      currentModelRef.current = undefined;
      lastResultIdRef.current = null;

      const pid = await window.api.claude.spawn(cwd, sessionId, mode);
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
