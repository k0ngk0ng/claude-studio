import { useCallback, useEffect, useRef } from 'react';

export function useTerminal(cwd: string) {
  const terminalIdRef = useRef<string | null>(null);
  const dataCallbackRef = useRef<((id: string, data: string) => void) | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const createTerminal = useCallback(async (): Promise<string | null> => {
    // Kill existing PTY if any
    if (terminalIdRef.current) {
      try {
        await window.api.terminal.kill(terminalIdRef.current);
      } catch {
        // Already dead
      }
    }

    const id = await window.api.terminal.create(cwdRef.current);
    terminalIdRef.current = id;
    return id;
  }, []);

  const writeToTerminal = useCallback(async (data: string) => {
    if (!terminalIdRef.current) return;
    await window.api.terminal.write(terminalIdRef.current, data);
  }, []);

  const resizeTerminal = useCallback(async (cols: number, rows: number) => {
    if (!terminalIdRef.current) return;
    await window.api.terminal.resize(terminalIdRef.current, cols, rows);
  }, []);

  const onData = useCallback(
    (callback: (data: string) => void) => {
      // Remove previous listener
      if (dataCallbackRef.current) {
        window.api.terminal.removeDataListener(dataCallbackRef.current);
      }

      const wrappedCallback = (id: string, data: string) => {
        if (id === terminalIdRef.current) {
          callback(data);
        }
      };

      dataCallbackRef.current = wrappedCallback;
      window.api.terminal.onData(wrappedCallback);
    },
    []
  );

  const killTerminal = useCallback(async () => {
    if (terminalIdRef.current) {
      await window.api.terminal.kill(terminalIdRef.current);
      terminalIdRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dataCallbackRef.current) {
        window.api.terminal.removeDataListener(dataCallbackRef.current);
        dataCallbackRef.current = null;
      }
      if (terminalIdRef.current) {
        window.api.terminal.kill(terminalIdRef.current);
        terminalIdRef.current = null;
      }
    };
  }, []);

  return {
    terminalId: terminalIdRef.current,
    createTerminal,
    writeToTerminal,
    resizeTerminal,
    onData,
    killTerminal,
  };
}
