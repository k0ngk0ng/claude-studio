import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './stores/appStore';
import { useSessions } from './hooks/useSessions';
import { useClaude } from './hooks/useClaude';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TopBar } from './components/TopBar/TopBar';
import { ChatView } from './components/Chat/ChatView';
import { InputBar } from './components/InputBar/InputBar';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { DiffPanel } from './components/DiffPanel/DiffPanel';
import { StatusBar } from './components/StatusBar/StatusBar';

export default function App() {
  const { panels, togglePanel, setCurrentProject, setPlatform, currentProject } =
    useAppStore();
  const { loadSessions } = useSessions();
  const { startSession, sendMessage, stopSession, isStreaming } = useClaude();

  // Initialize app
  useEffect(() => {
    async function init() {
      try {
        const [platform, projectPath] = await Promise.all([
          window.api.app.getPlatform(),
          window.api.app.getProjectPath(),
        ]);

        setPlatform(platform);

        const projectName = projectPath.split('/').pop() || projectPath;
        setCurrentProject({ path: projectPath, name: projectName });

        // Load existing sessions
        await loadSessions();

        // Get git branch
        try {
          const branch = await window.api.git.branch(projectPath);
          setCurrentProject({ path: projectPath, name: projectName, branch });
        } catch {
          // Not a git repo, that's fine
        }
      } catch (err) {
        console.error('Failed to initialize app:', err);
      }
    }

    init();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewThread();
      } else if (mod && e.key === 't') {
        e.preventDefault();
        togglePanel('terminal');
      } else if (mod && e.key === 'd') {
        e.preventDefault();
        togglePanel('diff');
      } else if (mod && e.key === 'b') {
        e.preventDefault();
        togglePanel('sidebar');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  const handleNewThread = useCallback(async () => {
    await stopSession();
    useAppStore.getState().resetCurrentSession();
    useAppStore.getState().setCurrentSession({
      projectPath: currentProject.path,
    });
  }, [stopSession, currentProject.path]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const state = useAppStore.getState();
      const projectPath = state.currentSession.projectPath || currentProject.path;

      // Start a new process if we don't have one
      if (!state.currentSession.processId) {
        await startSession(projectPath, state.currentSession.id || undefined);
      }

      await sendMessage(content);
    },
    [startSession, sendMessage, currentProject.path]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      {panels.sidebar && (
        <Sidebar onNewThread={handleNewThread} />
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar with drag region */}
        <TopBar onNewThread={handleNewThread} />

        {/* Chat area */}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-1 flex-col min-w-0">
            {/* Messages */}
            <ChatView />

            {/* Input */}
            <InputBar
              onSend={handleSendMessage}
              isStreaming={isStreaming}
              onStop={stopSession}
            />

            {/* Terminal panel */}
            {panels.terminal && <TerminalPanel />}
          </div>

          {/* Diff panel */}
          {panels.diff && <DiffPanel />}
        </div>

        {/* Status bar */}
        <StatusBar />
      </div>
    </div>
  );
}
