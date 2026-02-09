import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { debugLog } from '../stores/debugLogStore';
import type { SessionInfo, Message, ContentBlock, ToolUseInfo } from '../types';

function parseRawMessages(rawMessages: any[]): Message[] {
  const messages: Message[] = [];

  // Collect tool results keyed by tool_use_id for matching
  const toolResults = new Map<string, string>();
  for (const raw of rawMessages) {
    if (!raw.message) continue;
    const content = raw.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        let resultText = '';
        if (typeof block.content === 'string') {
          resultText = block.content;
        } else if (Array.isArray(block.content)) {
          resultText = block.content
            .filter((b: any) => b.type === 'text' && b.text)
            .map((b: any) => b.text)
            .join('\n');
        }
        toolResults.set(block.tool_use_id, resultText.slice(0, 2000));
      }
    }
  }

  // Now build display messages
  // Strategy: merge consecutive assistant entries into one message
  let currentAssistant: {
    texts: string[];
    tools: ToolUseInfo[];
    timestamp: string;
    id: string;
  } | null = null;

  function flushAssistant() {
    if (!currentAssistant) return;
    const content = currentAssistant.texts.join('\n\n').trim();
    // Only add if there's text content or tool use
    if (content || currentAssistant.tools.length > 0) {
      messages.push({
        id: currentAssistant.id,
        role: 'assistant',
        content: content,
        toolUse: currentAssistant.tools.length > 0 ? currentAssistant.tools : undefined,
        timestamp: currentAssistant.timestamp,
      });
    }
    currentAssistant = null;
  }

  for (const raw of rawMessages) {
    const type = raw.type;

    // Skip non-message types
    if (!raw.message || type === 'progress' || type === 'file-history-snapshot') continue;

    const role = raw.message.role as string;
    const content = raw.message.content;
    const timestamp = raw.timestamp || new Date().toISOString();
    const id = raw.uuid || crypto.randomUUID();

    if (role === 'user') {
      // Flush any pending assistant message
      flushAssistant();

      // Extract user text
      let userText = '';
      if (typeof content === 'string') {
        userText = content;
      } else if (Array.isArray(content)) {
        // User messages may have tool_result blocks — skip those
        const textParts = content
          .filter((b: any) => b.type === 'text' && b.text)
          .map((b: any) => b.text);
        userText = textParts.join('\n');
      }

      // Only add user messages with actual text (skip tool_result-only messages)
      if (userText.trim()) {
        messages.push({
          id,
          role: 'user',
          content: userText,
          timestamp,
        });
      }
    } else if (role === 'assistant') {
      // Start or continue building an assistant message
      if (!currentAssistant) {
        currentAssistant = {
          texts: [],
          tools: [],
          timestamp,
          id,
        };
      }

      if (typeof content === 'string') {
        if (content.trim()) {
          currentAssistant.texts.push(content);
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text?.trim()) {
            currentAssistant.texts.push(block.text);
          } else if (block.type === 'tool_use') {
            const result = block.id ? toolResults.get(block.id) : undefined;
            currentAssistant.tools.push({
              name: block.name || 'unknown',
              input: block.input || {},
              result: result,
            });
          }
          // Skip 'thinking' blocks — don't display them
        }
      }
    }
  }

  // Flush last assistant message
  flushAssistant();

  return messages;
}

export function useSessions() {
  const {
    setSessions,
    setCurrentSession,
    resetCurrentSession,
    setCurrentProject,
    saveCurrentRuntime,
    restoreRuntime,
    sessions,
    currentSession,
  } = useAppStore();

  const loadSessions = useCallback(async () => {
    try {
      const allSessions = await window.api.sessions.list();
      debugLog('session', `loaded ${allSessions.length} sessions`);
      setSessions(allSessions);
      return allSessions;
    } catch (err) {
      debugLog('session', 'failed to load sessions', err, 'error');
      console.error('Failed to load sessions:', err);
      return [];
    }
  }, [setSessions]);

  const loadSessionMessages = useCallback(
    async (projectPath: string, sessionId: string): Promise<Message[]> => {
      try {
        debugLog('session', `loading messages: ${sessionId} from ${projectPath}`);
        const rawMessages = await window.api.sessions.getMessages(
          projectPath,
          sessionId
        );
        const messages = parseRawMessages(rawMessages);
        debugLog('session', `parsed ${messages.length} messages from ${rawMessages.length} raw entries`);
        return messages;
      } catch (err) {
        debugLog('session', `failed to load messages: ${sessionId}`, err, 'error');
        console.error('Failed to load session messages:', err);
        return [];
      }
    },
    []
  );

  const selectSession = useCallback(
    async (session: SessionInfo) => {
      debugLog('session', `switching to session: ${session.id} (${session.projectName})`);
      // Save current session's runtime state before switching
      saveCurrentRuntime();

      // Try to restore cached runtime for the target session
      const restored = restoreRuntime(session.id);

      if (!restored) {
        // Show loading state immediately
        useAppStore.getState().setIsLoadingSession(true);

        // Set session info right away (clears old messages)
        setCurrentSession({
          id: session.id,
          projectPath: session.projectPath,
          title: session.title || session.lastMessage || '',
          messages: [],
          isStreaming: false,
          processId: null,
        });

        // Clear streaming state for non-running sessions
        useAppStore.getState().clearStreamingContent();
        useAppStore.getState().clearToolActivities();

        // Load messages from disk (may be slow for large sessions)
        try {
          const messages = await loadSessionMessages(
            session.projectPath,
            session.id
          );

          setCurrentSession({
            id: session.id,
            projectPath: session.projectPath,
            title: session.title || session.lastMessage || '',
            messages,
            isStreaming: false,
            processId: null,
          });
        } finally {
          useAppStore.getState().setIsLoadingSession(false);
        }
      }

      // Switch current project to match the selected thread
      const projectName = session.projectPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || session.projectName;
      setCurrentProject({ path: session.projectPath, name: projectName });

      // Update git branch for the new project
      try {
        const branch = await window.api.git.branch(session.projectPath);
        setCurrentProject({ path: session.projectPath, name: projectName, branch });
      } catch {
        // Not a git repo
      }
    },
    [loadSessionMessages, setCurrentSession, setCurrentProject, saveCurrentRuntime, restoreRuntime]
  );

  const createNewSession = useCallback(
    (projectPath: string) => {
      // Save current session's runtime state before switching
      saveCurrentRuntime();

      resetCurrentSession();
      setCurrentSession({
        projectPath,
        messages: [],
        id: null,
        processId: null,
        isStreaming: false,
      });
    },
    [resetCurrentSession, setCurrentSession, saveCurrentRuntime]
  );

  const listProjects = useCallback(async () => {
    try {
      return await window.api.sessions.listProjects();
    } catch (err) {
      console.error('Failed to list projects:', err);
      return [];
    }
  }, []);

  return {
    sessions,
    currentSession,
    loadSessions,
    loadSessionMessages,
    selectSession,
    createNewSession,
    listProjects,
  };
}
