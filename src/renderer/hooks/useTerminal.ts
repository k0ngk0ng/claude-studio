import { useCallback, useEffect, useRef } from 'react';

export function useTerminal(cwd: string) {
  const terminalIdRef = useRef<string | null>(null);
  const dataCallbackRef = useRef<((id: string, data: string) => void) | null>(null);

  const createTerminal = useCallback(async (): Promise<string | null> => {
    if (terminalIdRef.current) {
      await window.api.terminal.kill(terminalIdRef.current);
    }

    const id = await window.api.terminal.create(cwd);
    terminalIdRef.current = id;
    return id;
  }, [cwd]);

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
