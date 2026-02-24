import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useTabStore } from '../stores/tabStore';
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
    model?: string;
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
        model: currentAssistant.model,
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
      const model = raw.message.model;
      if (!currentAssistant) {
        currentAssistant = {
          texts: [],
          tools: [],
          timestamp,
          id,
          model,
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
        debugLog('session', `loading messages: ${sessionId}\n  projectPath: ${projectPath}\n  expected jsonl: ~/.claude/projects/.../${sessionId}.jsonl`);
        const rawMessages = await window.api.sessions.getMessages(
          projectPath,
          sessionId
        );
        debugLog('session', `parsed ${parseRawMessages(rawMessages).length} messages from ${rawMessages.length} raw entries`);
        const messages = parseRawMessages(rawMessages);
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

      // Open/activate tab for this session (no duplicates)
      useTabStore.getState().openTab({
        id: session.id,
        title: session.title || session.lastMessage || 'Thread',
        isNew: false,
        projectPath: session.projectPath,
      });

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

      // Create a temp ID so runtime save/restore can distinguish this tab
      const tempId = `new-${Date.now()}`;
      resetCurrentSession();
      setCurrentSession({
        projectPath,
        messages: [],
        id: tempId,
        processId: null,
        isStreaming: false,
      });

      // Open a new tab for this session
      useTabStore.getState().openTab({
        id: tempId,
        title: 'New Thread',
        isNew: true,
        projectPath,
      });
    },
    [resetCurrentSession, setCurrentSession, saveCurrentRuntime]
  );

  const forkSession = useCallback(
    async (cutoffMessageId: string) => {
      const state = useAppStore.getState();
      const { id: sessionId, projectPath } = state.currentSession;
      const effectivePath = projectPath || state.currentProject.path;

      if (!sessionId) {
        debugLog('session', 'fork: no session id — cannot fork unsaved session', undefined, 'warn');
        return;
      }

      debugLog('session', `forking session ${sessionId} at message ${cutoffMessageId}`);

      const newSessionId = await window.api.sessions.fork(effectivePath, sessionId, cutoffMessageId);
      if (!newSessionId) {
        debugLog('session', 'fork failed — backend returned null', undefined, 'error');
        return;
      }

      debugLog('session', `forked → new session ${newSessionId}`);

      // Save current runtime, then switch to the forked session
      saveCurrentRuntime();

      // Load the forked session's messages
      const messages = await loadSessionMessages(effectivePath, newSessionId);

      setCurrentSession({
        id: newSessionId,
        projectPath: effectivePath,
        title: messages[0]?.content?.slice(0, 80) || 'Forked thread',
        messages,
        isStreaming: false,
        processId: null,
      });

      // Open a tab for the forked session
      useTabStore.getState().openTab({
        id: newSessionId,
        title: messages[0]?.content?.slice(0, 80) || 'Forked thread',
        isNew: false,
        projectPath: effectivePath,
      });

      // Reload sidebar
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('claude:session-updated'));
      }, 300);
    },
    [saveCurrentRuntime, setCurrentSession, loadSessionMessages]
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
    forkSession,
    listProjects,
  };
}
