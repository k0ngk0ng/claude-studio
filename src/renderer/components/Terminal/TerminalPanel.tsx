import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminal } from '../../hooks/useTerminal';
import { useAppStore } from '../../stores/appStore';

export function TerminalPanel() {
  const { currentProject, togglePanel } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);

  const cwd = currentProject.path || process.cwd?.() || '/';
  const { createTerminal, writeToTerminal, resizeTerminal, onData } =
    useTerminal(cwd);

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#e4e4e4',
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
        white: '#e4e4e4',
        brightBlack: '#666666',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Create PTY backend
    const termId = await createTerminal();
    if (!termId) {
      term.writeln('\x1b[31mTerminal not available — node-pty may not be installed.\x1b[0m');
      return;
    }

    // Connect xterm input → PTY
    term.onData((data) => {
      writeToTerminal(data);
    });

    // Connect PTY output → xterm
    onData((data) => {
      term.write(data);
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      resizeTerminal(cols, rows);
    });

    // Observe container size changes
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during transitions
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [createTerminal, writeToTerminal, resizeTerminal, onData]);

  useEffect(() => {
    initTerminal();

    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      initializedRef.current = false;
    };
  }, [initTerminal]);

  return (
    <div className="shrink-0 border-t border-border bg-bg panel-transition" style={{ height: 250 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="8.5" y1="10" x2="11.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-medium text-text-secondary">Terminal</span>
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
