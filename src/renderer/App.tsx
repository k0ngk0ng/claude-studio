import React, { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';
import { useTabStore, type TabInfo } from './stores/tabStore';
import { debugLog } from './stores/debugLogStore';
import { useSessions } from './hooks/useSessions';
import { useClaude } from './hooks/useClaude';
import { useGit } from './hooks/useGit';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TopBar } from './components/TopBar/TopBar';
import { TabBar } from './components/TabBar/TabBar';
import { ChatView } from './components/Chat/ChatView';
import { chatScrollElement } from './components/Chat/ChatView';
import { InputBar } from './components/InputBar/InputBar';
import { BottomPanel } from './components/BottomPanel/BottomPanel';
import { RightPanel } from './components/DiffPanel/RightPanel';
import { Settings } from './components/Settings/Settings';
import { LoginModal } from './components/Auth/LoginModal';
import { LOCAL_COMMANDS, TERMINAL_ONLY_COMMANDS, SDK_SESSION_COMMANDS, BUILTIN_COMMANDS } from './components/InputBar/SlashCommandPopup';

export default function App() {
  const { panels, togglePanel, setCurrentProject, setPlatform, currentProject } =
    useAppStore();
  const { isOpen: settingsOpen, openSettings, closeSettings, settings } = useSettingsStore();
  const { validateSession: validateAuthSession } = useAuthStore();
  const { loadSessions, selectSession } = useSessions();
  const { startSession, sendMessage, stopSession, isStreaming } = useClaude();

  // Keep git status polling active at app level so commit badge always updates
  useGit();

  // Guard against race conditions during rapid tab switching
  const switchCounterRef = useRef(0);

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

  // ─── Appearance CSS variables (real-time) ──────────────────────────
  useEffect(() => {
    const { fontSize, fontFamily, editorFontSize, editorFontFamily } = settings.appearance;
    const s = document.documentElement.style;
    s.setProperty('--ui-font-size', `${fontSize}px`);
    s.setProperty('--ui-font-family', fontFamily);
    s.setProperty('--editor-font-size', `${editorFontSize}px`);
    s.setProperty('--editor-font-family', editorFontFamily);
  }, [
    settings.appearance.fontSize,
    settings.appearance.fontFamily,
    settings.appearance.editorFontSize,
    settings.appearance.editorFontFamily,
  ]);

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

        // Validate auth session
        validateAuthSession();

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

  // ─── New thread ───────────────────────────────────────────────────
  const handleNewThread = useCallback(async () => {
    // Save current session's runtime (don't kill the process — let it run in background)
    useAppStore.getState().saveCurrentRuntime();

    // Open a new tab with a temp ID — use it as session ID so runtime save/restore works
    const tempId = `new-${Date.now()}`;
    useAppStore.getState().resetCurrentSession();
    useAppStore.getState().setCurrentSession({
      id: tempId,
      projectPath: currentProject.path,
    });

    useTabStore.getState().openTab({
      id: tempId,
      title: 'New Thread',
      isNew: true,
      projectPath: currentProject.path,
    });
  }, [currentProject.path]);

  // ─── Tab handlers ────────────────────────────────────────────────
  const switchToTab = useCallback(
    async (tab: TabInfo) => {
      // Bump counter to detect stale async operations
      const mySwitch = ++switchCounterRef.current;

      // Save current tab's scroll position BEFORE any state changes tear down the DOM
      const currentId = useAppStore.getState().currentSession.id;
      if (currentId && chatScrollElement) {
        useTabStore.getState().saveScrollPosition(currentId, chatScrollElement.scrollTop);
      }

      if (tab.isNew) {
        // Switching to a "new thread" tab — restore its runtime or reset
        useAppStore.getState().saveCurrentRuntime();
        const restored = useAppStore.getState().restoreRuntime(tab.id);
        if (!restored) {
          useAppStore.getState().resetCurrentSession();
          useAppStore.getState().setCurrentSession({
            id: tab.id,
            projectPath: tab.projectPath || currentProject.path,
          });
        }
      } else {
        // Switching to an existing session tab — use selectSession flow
        const sessions = useAppStore.getState().sessions;
        const session = sessions.find((s) => s.id === tab.id);
        if (session) {
          await selectSession(session);
          // If another switch happened while we were awaiting, bail out —
          // the newer switch will set the correct state
          if (switchCounterRef.current !== mySwitch) {
            debugLog('app', `stale tab switch to ${tab.id} — superseded by newer switch`);
            return;
          }
        }
      }
    },
    [selectSession, currentProject.path]
  );

  const handleTabSelect = useCallback(
    async (tab: TabInfo) => {
      const tabStore = useTabStore.getState();
      if (tab.id === tabStore.activeTabId) return; // already active

      tabStore.setActiveTab(tab.id);
      await switchToTab(tab);
    },
    [switchToTab]
  );

  const handleTabClose = useCallback(
    async (tabId: string) => {
      const appState = useAppStore.getState();

      // Check if this tab has a streaming process
      let isStreaming = false;
      if (appState.currentSession.id === tabId) {
        isStreaming = appState.currentSession.isStreaming;
      } else {
        const runtime = appState.sessionRuntimes.get(tabId);
        if (runtime?.isStreaming) isStreaming = true;
      }

      // Confirm before closing a streaming tab
      if (isStreaming) {
        const confirmed = window.confirm(
          'This conversation is still in progress. Close it anyway?'
        );
        if (!confirmed) return;
      }

      // Find the process to kill — check current session or background runtimes
      let processIdToKill: string | null = null;
      if (appState.currentSession.id === tabId && appState.currentSession.processId) {
        processIdToKill = appState.currentSession.processId;
      } else {
        const runtime = appState.sessionRuntimes.get(tabId);
        if (runtime?.processId) {
          processIdToKill = runtime.processId;
        }
      }

      // Kill the Claude process if running
      if (processIdToKill) {
        try {
          await window.api.claude.kill(processIdToKill);
        } catch {
          // Process may already be dead
        }
      }

      // Clean up runtime cache
      appState.removeRuntime(tabId);

      // Close the tab and get the new active tab ID
      const newActiveId = useTabStore.getState().closeTab(tabId);

      // Switch to the new active tab — directly load its session
      if (newActiveId) {
        const tab = useTabStore.getState().openTabs.find((t) => t.id === newActiveId);
        if (tab) {
          await switchToTab(tab);
        }
      } else {
        // No tabs left — reset to welcome screen
        useAppStore.getState().resetCurrentSession();
        useAppStore.getState().setCurrentSession({
          projectPath: currentProject.path,
        });
      }
    },
    [switchToTab, currentProject.path]
  );

  // ─── Local slash command handlers ───────────────────────────────────
  const handleLocalCommand = useCallback(
    (content: string): boolean => {
      const trimmed = content.trim();
      if (!trimmed.startsWith('/')) return false;

      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (!LOCAL_COMMANDS.has(cmd)) return false;

      const { addMessage } = useAppStore.getState();

      // Terminal-only commands — show hint instead of sending to SDK
      if (TERMINAL_ONLY_COMMANDS.has(cmd)) {
        addMessage({
          id: `local-${cmd}-${Date.now()}`,
          role: 'system',
          content: `\`/${cmd}\` requires an interactive terminal. Run \`claude /${cmd}\` in the built-in terminal (⌘T) or your system terminal.`,
          timestamp: new Date().toISOString(),
        });
        return true;
      }

      switch (cmd) {
        case 'config': {
          openSettings();
          return true;
        }

        case 'help': {
          // Build help text as markdown
          const lines = ['**Available slash commands:**\n'];
          for (const c of BUILTIN_COMMANDS) {
            const hint = c.argumentHint ? ` \`${c.argumentHint}\`` : '';
            lines.push(`- \`/${c.name}\`${hint} — ${c.description}`);
          }
          lines.push('');
          lines.push('Custom commands from `~/.claude/commands/` are also available.');

          addMessage({
            id: `local-help-${Date.now()}`,
            role: 'assistant',
            content: lines.join('\n'),
            timestamp: new Date().toISOString(),
          });
          return true;
        }

        default:
          return false;
      }
    },
    [openSettings]
  );

  // ─── Send message ─────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (content: string, permissionMode?: string) => {
      // Intercept local commands first
      if (handleLocalCommand(content)) return;

      const state = useAppStore.getState();
      const projectPath = state.currentSession.projectPath || currentProject.path;

      // SDK slash commands need a running process — don't spawn a throwaway session
      const trimmed = content.trim();
      if (trimmed.startsWith('/')) {
        const cmd = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
        if (SDK_SESSION_COMMANDS.has(cmd) && !state.currentSession.processId) {
          useAppStore.getState().addMessage({
            id: `local-${cmd}-${Date.now()}`,
            role: 'system',
            content: `\`/${cmd}\` requires an active conversation. Send a message first to start a session, then use \`/${cmd}\`.`,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Start a new process if we don't have one
      if (!state.currentSession.processId) {
        // Pass sessionId to resume if this session has a real UUID (not a temp "new-*" id)
        const rawId = state.currentSession.id || '';
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        const sessionId = isUUID ? rawId : undefined;
        await startSession(projectPath, sessionId, permissionMode);
      }

      await sendMessage(content);
    },
    [startSession, sendMessage, currentProject.path, handleLocalCommand]
  );

  // ─── Keyboard shortcuts (after all callbacks are defined) ─────────
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
      } else if (mod && e.key === 'w') {
        // Close active tab
        e.preventDefault();
        const activeId = useTabStore.getState().activeTabId;
        if (activeId) handleTabClose(activeId);
      } else if (e.ctrlKey && e.key === 'Tab') {
        // Ctrl+Tab / Ctrl+Shift+Tab to switch tabs
        e.preventDefault();
        const tabState = useTabStore.getState();
        const { openTabs, activeTabId } = tabState;
        if (openTabs.length <= 1) return;
        const idx = openTabs.findIndex((t) => t.id === activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + openTabs.length) % openTabs.length
          : (idx + 1) % openTabs.length;
        handleTabSelect(openTabs[next]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, openSettings, closeSettings, settingsOpen, handleNewThread, handleTabClose, handleTabSelect]);

  // Show settings page when open
  if (settingsOpen) {
    return <Settings />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* Login modal */}
      <LoginModal />

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
            {/* Tab bar — inside the chat column so it doesn't span over RightPanel */}
            <TabBar
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
              onNewThread={handleNewThread}
            />

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
