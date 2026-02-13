import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminal } from '../../hooks/useTerminal';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';

export function TerminalPanel({ bare, visible }: { bare?: boolean; visible?: boolean } = {}) {
  const { currentProject, togglePanel, panelSizes, setPanelSize } = useAppStore();
  const { editorFontSize, editorFontFamily } = useSettingsStore(
    (s) => s.settings.appearance
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const cwd = currentProject.path || '';
  const { createTerminal, writeToTerminal, resizeTerminal, onData, onExit } =
    useTerminal(cwd);

  // Stable refs for callbacks so xterm wiring doesn't break
  const writeRef = useRef(writeToTerminal);
  const resizeRef = useRef(resizeTerminal);
  writeRef.current = writeToTerminal;
  resizeRef.current = resizeTerminal;

  const { handleMouseDown } = useResizable({
    direction: 'vertical',
    size: panelSizes.terminal,
    minSize: 120,
    maxSize: 600,
    reverse: false,
    onResize: (size) => setPanelSize('terminal', size),
  });

  // Re-fit terminal when panel size changes
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
      } catch {
        // Ignore fit errors during transitions
      }
    }
  }, [panelSizes.terminal, visible]);

  // Initialize terminal only when BOTH visible and cwd are ready
  // Once initialized, never destroy — preserve state across hide/show
  useEffect(() => {
    if (!visible || !cwd || !containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#f5f5f5',
        cursor: '#e87b35',
        cursorAccent: '#1a1a1a',
        selectionBackground: 'rgba(232, 123, 53, 0.3)',
        black: '#1a1a1a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f5f5f5',
        brightBlack: '#737373',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      fontFamily: editorFontFamily || '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
      fontSize: editorFontSize || 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Small delay to let the DOM fully layout, then fit + create PTY
    setTimeout(async () => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }

      // Create PTY backend
      const termId = await createTerminal();
      if (!termId) {
        term.writeln('\x1b[31mTerminal not available — node-pty may not be installed.\x1b[0m');
        return;
      }

      // Connect xterm input → PTY
      term.onData((data) => {
        writeRef.current(data);
      });

      // Connect PTY output → xterm
      onData((data) => {
        term.write(data);
      });

      // Handle shell exit (e.g. Ctrl+D) — respawn a new PTY
      // No need to re-register onData — it uses terminalIdRef which auto-updates
      onExit(async () => {
        term.writeln('\r\n\x1b[90m[shell exited — restarting…]\x1b[0m\r\n');
        await createTerminal();
      });

      // Handle resize
      term.onResize(({ cols, rows }) => {
        resizeRef.current(cols, rows);
      });
    }, 100);

    // Observe container size changes
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during transitions
      }
    });
    resizeObserver.observe(containerRef.current);
    resizeObserverRef.current = resizeObserver;

    // No cleanup — terminal persists for the lifetime of the app
  }, [visible, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when panel becomes visible again (after first init)
  useEffect(() => {
    if (visible && initializedRef.current && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Sync terminal font settings in real-time
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.options.fontSize = editorFontSize || 13;
    term.options.fontFamily = editorFontFamily || '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace';
    try {
      fitAddonRef.current?.fit();
    } catch {
      // Ignore
    }
  }, [editorFontSize, editorFontFamily]);

  // Bare mode: just the terminal container, no chrome
  if (bare) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full px-2 py-1"
      />
    );
  }

  return (
    <div
      className="relative shrink-0 border-t border-border bg-bg"
      style={{ height: panelSizes.terminal }}
    >
      {/* Top-edge resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute -top-[2px] left-0 right-0 h-[5px] cursor-row-resize z-10 group"
      >
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2
                        opacity-0 group-hover:opacity-100 bg-accent/50 transition-opacity" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="8.5" y1="10" x2="11.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-medium text-text-secondary">Terminal</span>
          <span className="text-[10px] text-text-muted truncate max-w-[200px]">{cwd}</span>
        </div>
        <button
          onClick={() => togglePanel('terminal')}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="w-full px-2 py-1"
        style={{ height: 'calc(100% - 33px)' }}
      />
    </div>
  );
}
