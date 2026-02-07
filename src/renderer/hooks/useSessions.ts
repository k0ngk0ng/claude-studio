import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import type { SessionInfo, Message, ContentBlock } from '../types';

function parseRawMessages(rawMessages: any[]): Message[] {
  const messages: Message[] = [];

  for (const raw of rawMessages) {
    if (!raw.message) continue;

    const role = raw.message.role as 'user' | 'assistant' | 'system';
    let content = '';
    let contentBlocks: ContentBlock[] | undefined;

    if (typeof raw.message.content === 'string') {
      content = raw.message.content;
    } else if (Array.isArray(raw.message.content)) {
      contentBlocks = raw.message.content;
      content = raw.message.content
        .filter((b: ContentBlock) => b.type === 'text' && b.text)
        .map((b: ContentBlock) => b.text!)
        .join('\n');
    }

    if (content || contentBlocks) {
      messages.push({
        id: raw.uuid || crypto.randomUUID(),
        role,
        content,
        contentBlocks,
        timestamp: raw.timestamp || new Date().toISOString(),
      });
    }
  }

  return messages;
}

export function useSessions() {
  const {
    setSessions,
    setCurrentSession,
    resetCurrentSession,
    sessions,
    currentSession,
  } = useAppStore();

  const loadSessions = useCallback(async () => {
    try {
      const allSessions = await window.api.sessions.list();
      setSessions(allSessions);
      return allSessions;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    }
  }, [setSessions]);

  const loadSessionMessages = useCallback(
    async (projectPath: string, sessionId: string): Promise<Message[]> => {
      try {
        const rawMessages = await window.api.sessions.getMessages(
          projectPath,
          sessionId
        );
        return parseRawMessages(rawMessages);
      } catch (err) {
        console.error('Failed to load session messages:', err);
        return [];
      }
    },
    []
  );

  const selectSession = useCallback(
    async (session: SessionInfo) => {
      const messages = await loadSessionMessages(
        session.projectPath,
        session.id
      );

      setCurrentSession({
        id: session.id,
        projectPath: session.projectPath,
        messages,
        isStreaming: false,
        processId: null,
      });
    },
    [loadSessionMessages, setCurrentSession]
  );

  const createNewSession = useCallback(
    (projectPath: string) => {
      resetCurrentSession();
      setCurrentSession({
        projectPath,
        messages: [],
        id: null,
        processId: null,
        isStreaming: false,
      });
    },
    [resetCurrentSession, setCurrentSession]
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
