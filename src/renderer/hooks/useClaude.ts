import { useCallback, useEffect, useRef } from 'react';
import { useAppStore, type ToolActivity } from '../stores/appStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { debugLog } from '../stores/debugLogStore';
import type { ContentBlock, Message, ToolUseInfo, PermissionRequestEvent } from '../types';

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
  parent_tool_use_id?: string | null;
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
  errors?: string[];
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

/**
 * Commit the current turn's streaming text + tool activities as a finalized
 * assistant message. This is called at turn boundaries (when message_start
 * fires for a new turn after tool use) so each turn becomes its own message
 * bubble with inline tool cards — matching how history is displayed.
 */
function commitCurrentTurn(
  streamingText: string,
  tools: ToolActivity[],
  model?: string,
): Message | null {
  if (!streamingText && tools.length === 0) return null;

  // Convert ToolActivity[] to ToolUseInfo[] for the message
  const toolUse: ToolUseInfo[] = tools.map(t => {
    let input: Record<string, unknown> = {};
    if (t.inputFull) {
      try { input = JSON.parse(t.inputFull); } catch { /* ignore */ }
    }
    return {
      name: t.name,
      input,
      result: t.output,
    };
  });

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: streamingText,
    timestamp: new Date().toISOString(),
    model,
    ...(toolUse.length > 0 ? { toolUse } : {}),
  };
}

export function useClaude() {
  const store = useAppStore();
  const processIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef('');
  const currentModelRef = useRef<string | undefined>(undefined);
  const lastResultIdRef = useRef<string | null>(null);
  // Track whether we've seen at least one message_start (to detect turn boundaries)
  const turnCountRef = useRef(0);
  // Track current tool use block
  const currentToolIdRef = useRef<string | null>(null);
  const toolInputJsonRef = useRef('');
  // Queue for tool results that arrive before the tool activity is added
  const pendingToolResultsRef = useRef<Map<string, { status: 'done'; output: string }>>(new Map());

  // Sync processIdRef when currentSession.processId changes (e.g., after restoreRuntime)
  useEffect(() => {
    processIdRef.current = store.currentSession.processId;
  }, [store.currentSession.processId]);

  /**
   * Handle events from background (non-current) processes.
   * Updates the cached sessionRuntime so messages aren't lost.
   */
  const handleBackgroundEvent = useCallback((processId: string, event: StreamEvent) => {
    const { updateBackgroundRuntime, findSessionKeyByProcessId } = useAppStore.getState();
    const sessionKey = findSessionKeyByProcessId(processId);
    if (!sessionKey) return; // orphan process, ignore

    // Handle key event types for background sessions
    if (event.type === 'assistant' && event.message) {
      const text = extractTextFromContent(event.message.content);
      if (text) {
        updateBackgroundRuntime(processId, (rt) => ({
          ...rt,
          streamingContent: text,
          isStreaming: true,
        }));
      }
    } else if (event.type === 'result') {
      // Session finished — commit final message and mark as not streaming
      const text = extractTextFromContent(event.message?.content);
      updateBackgroundRuntime(processId, (rt) => {
        const finalText = text || rt.streamingContent;
        const newMessages = finalText
          ? [...rt.messages, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: finalText,
              timestamp: new Date().toISOString(),
            }]
          : rt.messages;
        return {
          ...rt,
          messages: newMessages,
          isStreaming: false,
          streamingContent: '',
        };
      });
    } else if (event.type === 'error' || event.type === 'exit') {
      // Process ended — mark as not streaming, clear processId
      updateBackgroundRuntime(processId, (rt) => ({
        ...rt,
        isStreaming: false,
        processId: null,
        streamingContent: '',
      }));
    } else if (event.session_id) {
      // System event with session_id — re-key the runtime if needed
      const state = useAppStore.getState();
      const oldKey = sessionKey;
      const newKey = event.session_id;
      if (oldKey !== newKey && state.sessionRuntimes.has(oldKey)) {
        const runtime = state.sessionRuntimes.get(oldKey)!;
        const runtimes = new Map(state.sessionRuntimes);
        runtimes.delete(oldKey);
        runtimes.set(newKey, runtime);
        useAppStore.setState({ sessionRuntimes: runtimes });
      }
    }
  }, []);

  useEffect(() => {
    const handler = (processId: string, raw: unknown) => {
      const event = raw as StreamEvent;

      // If this message is NOT for the current session, route to background runtime
      if (processId !== processIdRef.current) {
        handleBackgroundEvent(processId, event);
        return;
      }

      // Subagent events (Task tool children) — extract progress info for the parent tool card
      // instead of silently skipping everything.
      if (event.parent_tool_use_id) {
        const parentId = event.parent_tool_use_id;
        const { toolActivities } = useAppStore.getState();
        const parentTool = toolActivities.find(a => a.id === parentId);

        if (parentTool && parentTool.status === 'running') {
          // Extract useful progress info from subagent events
          let progressHint: string | undefined;

          if (event.type === 'assistant' && event.message?.content) {
            // Subagent is thinking/responding — show brief text
            const content = event.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_use' && block.name) {
                  progressHint = `→ ${block.name}`;
                  if (block.name === 'Read' && (block as any).input?.file_path) {
                    const fp = (block as any).input.file_path as string;
                    progressHint = `→ Reading ${fp.split('/').pop()}`;
                  } else if (block.name === 'Bash' && (block as any).input?.command) {
                    const cmd = ((block as any).input.command as string).slice(0, 50);
                    progressHint = `→ $ ${cmd}`;
                  } else if (block.name === 'Grep' && (block as any).input?.pattern) {
                    progressHint = `→ Grep: ${(block as any).input.pattern}`;
                  } else if (block.name === 'Glob' && (block as any).input?.pattern) {
                    progressHint = `→ Glob: ${(block as any).input.pattern}`;
                  } else if (block.name === 'Edit' && (block as any).input?.file_path) {
                    const fp = (block as any).input.file_path as string;
                    progressHint = `→ Editing ${fp.split('/').pop()}`;
                  } else if (block.name === 'Write' && (block as any).input?.file_path) {
                    const fp = (block as any).input.file_path as string;
                    progressHint = `→ Writing ${fp.split('/').pop()}`;
                  }
                }
              }
            }
          }

          if (progressHint) {
            useAppStore.setState({
              toolActivities: toolActivities.map(a =>
                a.id === parentId
                  ? { ...a, input: progressHint }
                  : a
              ),
            });
          }
        }
        return;
      }

      // Log all incoming events (except high-frequency content_block_delta)
      if (event.type === 'stream_event') {
        const evtType = event.event?.type || '';
        if (evtType !== 'content_block_delta') {
          debugLog('claude', `stream: ${evtType}${event.event?.content_block?.type ? ' [' + event.event.content_block.type + (event.event.content_block.name ? ':' + event.event.content_block.name : '') + ']' : ''}${event.event?.delta?.stop_reason ? ' stop=' + event.event.delta.stop_reason : ''}`);
        }
      } else {
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
              turnCountRef.current += 1;
              const turnNum = turnCountRef.current;

              // If this is turn 2+, commit the previous turn's text + tools
              // as a finalized assistant message so each turn gets its own bubble.
              if (turnNum > 1) {
                const { toolActivities: prevTools } = useAppStore.getState();
                const prevText = streamingTextRef.current;

                if (prevText || prevTools.length > 0) {
                  const committed = commitCurrentTurn(prevText, prevTools, currentModelRef.current);
                  if (committed) {
                    debugLog('claude', `message_start turn ${turnNum}: committing previous turn — text: ${prevText.length} chars, tools: ${prevTools.length}`);
                    addMessage(committed);
                  }
                  // Reset streaming state for the new turn
                  streamingTextRef.current = '';
                  clearStreamingContent();
                  clearToolActivities();
                }
              }

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
              } else if (evt.content_block?.type === 'text') {
                // Text block starting in current turn — no special handling needed
                // since each turn is now its own message bubble.
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
                    const subagentMatch = partial.match(/"subagent_type"\s*:\s*"([^"]+)"/);
                    const input = fileMatch?.[1] || cmdMatch?.[1] || patternMatch?.[1]
                      || urlMatch?.[1] || descMatch?.[1] || promptMatch?.[1];
                    const brief = input
                      ? (input.length > 60 ? '…' + input.slice(-57) : input)
                      : undefined;

                    // For Task tool: update name to include subagent type (e.g. "Task (Explore)")
                    const updatedName = (activity.name === 'Task' && subagentMatch?.[1])
                      ? `Task (${subagentMatch[1]})`
                      : activity.name;

                    // Always update inputFull, and set brief input once
                    useAppStore.setState({
                      toolActivities: toolActivities.map(a =>
                        a.id === currentToolIdRef.current
                          ? { ...a, inputFull: partial, input: a.input || brief, name: updatedName }
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
          // Complete assistant message snapshot — contains both text and tool_use blocks.
          // With --include-partial-messages, this fires multiple times with cumulative content
          // across ALL turns. We NEVER use the snapshot text for streaming display —
          // content_block_delta is the reliable source. The snapshot would cause double text
          // especially during resume (fork/continue) where history is replayed.
          const content = event.message?.content;

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

          // Use the current turn's streaming text (not event.result which is cumulative
          // across ALL turns). Previous turns have already been committed as messages.
          const lastTurnText = streamingTextRef.current;

          // Also grab any remaining tool activities for the final turn
          const { toolActivities: finalTools } = useAppStore.getState();

          debugLog('claude', `result received — cost: $${event.total_cost_usd?.toFixed(4) || '?'}, duration: ${event.duration_ms || '?'}ms, turns: ${turnCountRef.current}, final turn text: ${lastTurnText?.length || 0}`, {
            session_id: event.session_id,
            total_cost_usd: event.total_cost_usd,
            duration_ms: event.duration_ms,
            num_turns: event.num_turns,
            hasEventResult: event.result !== undefined,
            hasStreamingText: streamingTextRef.current.length > 0,
            finalToolCount: finalTools.length,
            resultPreview: lastTurnText ? lastTurnText.slice(0, 200) : '(empty)',
          });

          setIsStreaming(false);
          clearStreamingContent();

          // Safety net: mark any still-running tools as done before committing
          if (finalTools.some(a => a.status === 'running')) {
            const markedTools = finalTools.map(a =>
              a.status === 'running' ? { ...a, status: 'done' as const } : a
            );
            // Commit the final turn with marked-done tools
            if (lastTurnText || markedTools.length > 0) {
              const message = commitCurrentTurn(lastTurnText, markedTools, currentModelRef.current);
              if (message) {
                addMessage({
                  ...message,
                  costUsd: event.total_cost_usd,
                  durationMs: event.duration_ms,
                });
              }
            }
          } else if (lastTurnText || finalTools.length > 0) {
            const message = commitCurrentTurn(lastTurnText, finalTools, currentModelRef.current);
            if (message) {
              addMessage({
                ...message,
                costUsd: event.total_cost_usd,
                durationMs: event.duration_ms,
              });
            }
          } else if (!lastTurnText && finalTools.length === 0 && turnCountRef.current <= 1) {
            // Single-turn with no streaming text — try event.result as fallback
            const fallbackText = typeof event.result === 'string' ? event.result : '';

            // Check if this is an error result (e.g. error_during_execution)
            if (event.subtype === 'error_during_execution' || event.is_error) {
              // SDKResultError has errors: string[] with detailed error messages
              const errorsArray = Array.isArray((event as any).errors) ? (event as any).errors as string[] : [];
              const errorMsg = errorsArray.length > 0
                ? errorsArray.join('\n')
                : (fallbackText || `Execution error (${event.subtype || 'unknown'})`);
              debugLog('claude', `result error: ${errorMsg}`, event, 'error');
              addMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: `Error: ${errorMsg}`,
                timestamp: new Date().toISOString(),
              });
            } else if (fallbackText) {
              addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: fallbackText,
                timestamp: new Date().toISOString(),
                model: currentModelRef.current,
                costUsd: event.total_cost_usd,
                durationMs: event.duration_ms,
              });
            } else {
              debugLog('claude', 'result had no text — no message added', undefined, 'warn');
            }
          }

          clearToolActivities();
          streamingTextRef.current = '';
          currentModelRef.current = undefined;
          turnCountRef.current = 0;
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
          turnCountRef.current = 0;
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
          turnCountRef.current = 0;
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

  // Listen for permission requests from the Agent SDK (via main process IPC)
  // When canUseTool fires, the main process forwards the request here.
  // We show a prompt in the UI and send the response back via IPC.
  useEffect(() => {
    const handler = (_processId: string, request: PermissionRequestEvent) => {
      const { requestId, toolName, input } = request;

      // Extract a human-readable command description
      let command = '';
      if (toolName === 'Bash') {
        command = (input as any).command || '';
      } else if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') {
        command = (input as any).file_path || '';
      } else {
        command = JSON.stringify(input).slice(0, 200);
      }

      debugLog('claude', `permission request: ${toolName} — ${command.slice(0, 100)}`, {
        requestId,
        toolName,
        input,
      });

      // Add to permission store for UI display
      usePermissionStore.getState().addRequest({
        id: requestId,
        toolName,
        command,
        toolPattern: `${toolName}(${command.split(/\s+/).slice(0, 2).join(' ')} *)`,
        input: input as Record<string, unknown>,
        timestamp: Date.now(),
        status: 'pending',
      });
    };

    window.api.claude.onPermissionRequest(handler);
    return () => {
      window.api.claude.removePermissionRequestListener(handler);
    };
  }, []);

  const startSession = useCallback(
    async (cwd: string, sessionId?: string, permissionMode?: string) => {
      const mode = permissionMode || 'default';

      // Read env vars from provider settings to pass to the main process
      const providerSettings = useSettingsStore.getState().settings.provider;
      const envVars = providerSettings.envVars.filter((v) => v.enabled && v.key && v.value);

      // Read language setting
      const language = useSettingsStore.getState().settings.general.language || 'auto';

      debugLog('claude', `spawning SDK session — cwd: ${cwd}${sessionId ? ', resume: ' + sessionId : ''}, mode: ${mode}, envVars: ${envVars.length}`, {
        cwd,
        sessionId,
        permissionMode: mode,
        envVarCount: envVars.length,
      });

      // Save current process to background runtime before starting new one
      // (don't kill it — let it continue running)
      if (processIdRef.current) {
        useAppStore.getState().saveCurrentRuntime();
        processIdRef.current = null;
      }

      streamingTextRef.current = '';
      currentModelRef.current = undefined;
      lastResultIdRef.current = null;
      turnCountRef.current = 0;

      // Clear any pending permission requests from previous session
      usePermissionStore.getState().clearRequests();

      const pid = await window.api.claude.spawn(cwd, sessionId, mode, envVars, language);
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
    turnCountRef.current = 0;
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
      turnCountRef.current = 0;
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
