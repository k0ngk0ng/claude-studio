import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { debugLog } from './stores/debugLogStore';
import { useSessions } from './hooks/useSessions';
import { useClaude } from './hooks/useClaude';
import { useGit } from './hooks/useGit';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TopBar } from './components/TopBar/TopBar';
import { ChatView } from './components/Chat/ChatView';
import { InputBar } from './components/InputBar/InputBar';
import { BottomPanel } from './components/BottomPanel/BottomPanel';
import { RightPanel } from './components/DiffPanel/RightPanel';
import { Settings } from './components/Settings/Settings';

export default function App() {
  const { panels, togglePanel, setCurrentProject, setPlatform, currentProject } =
    useAppStore();
  const { isOpen: settingsOpen, openSettings, closeSettings, settings } = useSettingsStore();
  const { loadSessions } = useSessions();
  const { startSession, sendMessage, stopSession, isStreaming } = useClaude();

  // Keep git status polling active at app level so commit badge always updates
  useGit();

  // ─── Theme switching ──────────────────────────────────────────────
  useEffect(() => {
    const theme = settings.appearance.theme;
    const html = document.documentElement;

    function applyTheme(mode: 'dark' | 'light') {
      html.classList.remove('dark', 'light');
      html.classList.add(mode);
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [settings.appearance.theme]);

  // Initialize app
  useEffect(() => {
    async function init() {
      try {
        const [platform, projectPath] = await Promise.all([
          window.api.app.getPlatform(),
          window.api.app.getProjectPath(),
        ]);

        debugLog('app', `initialized — platform: ${platform}, cwd: ${projectPath}`);
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

  // Auto-reload sessions when files change
  useEffect(() => {
    const handleChanged = () => {
      loadSessions();
    };
    window.api.sessions.onSessionsChanged(handleChanged);
    return () => {
      window.api.sessions.removeSessionsChangedListener(handleChanged);
    };
  }, [loadSessions]);

  // Reload sessions when a new session is created or completed
  useEffect(() => {
    const handleSessionUpdated = () => {
      loadSessions();
    };
    window.addEventListener('claude:session-updated', handleSessionUpdated);
    return () => {
      window.removeEventListener('claude:session-updated', handleSessionUpdated);
    };
  }, [loadSessions]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // On macOS use metaKey (⌘), on other platforms use ctrlKey
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewThread();
      } else if (mod && e.key === 't') {
        e.preventDefault();
        const { panels: p } = useAppStore.getState();
        // Toggle bottom panel: if any bottom panel is open, close all; otherwise open terminal
        if (p.terminal || p.logs) {
          if (p.terminal) togglePanel('terminal');
          if (p.logs) togglePanel('logs');
        } else {
          togglePanel('terminal');
        }
      } else if (mod && e.key === 'd') {
        e.preventDefault();
        togglePanel('diff');
      } else if (mod && e.key === 'b') {
        e.preventDefault();
        togglePanel('sidebar');
      } else if (mod && e.key === ',') {
        e.preventDefault();
        openSettings();
      } else if (e.key === 'Escape' && settingsOpen) {
        e.preventDefault();
        closeSettings();
      } else if (e.key === 'F12' || (mod && e.altKey && (e.key === 'i' || e.key === 'I'))) {
        // DevTools — only when debug mode is on
        const debugOn = useSettingsStore.getState().settings.general.debugMode;
        if (debugOn) {
          e.preventDefault();
          window.api.app.toggleDevTools();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, openSettings, closeSettings, settingsOpen]);

  const handleNewThread = useCallback(async () => {
    // Save current session's runtime (don't kill the process — let it run in background)
    useAppStore.getState().saveCurrentRuntime();
    useAppStore.getState().resetCurrentSession();
    useAppStore.getState().setCurrentSession({
      projectPath: currentProject.path,
    });
  }, [currentProject.path]);

  const handleSendMessage = useCallback(
    async (content: string, permissionMode?: string) => {
      const state = useAppStore.getState();
      const projectPath = state.currentSession.projectPath || currentProject.path;

      // Start a new process if we don't have one
      if (!state.currentSession.processId) {
        // Pass sessionId to resume if this session has one (e.g. forked thread)
        const sessionId = state.currentSession.id || undefined;
        await startSession(projectPath, sessionId, permissionMode);
      }

      await sendMessage(content);
    },
    [startSession, sendMessage, currentProject.path]
  );

  // Show settings page when open
  if (settingsOpen) {
    return <Settings />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      {panels.sidebar && (
        <Sidebar onNewThread={handleNewThread} />
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar with drag region */}
        <TopBar />

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

            {/* Bottom panel (Terminal + Debug Logs tabs) — always mounted, hidden via CSS */}
            <BottomPanel visible={panels.terminal || panels.logs} />
          </div>

          {/* Right panel (Changes + Files tabs) — always mounted, hidden via CSS */}
          <RightPanel visible={panels.diff} />
        </div>
      </div>
    </div>
  );
}
