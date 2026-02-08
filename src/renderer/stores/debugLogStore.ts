import { create } from 'zustand';

export type LogCategory = 'claude' | 'session' | 'git' | 'app' | 'error';

export interface LogEntry {
  id: number;
  timestamp: number;
  category: LogCategory;
  message: string;
  detail?: string; // JSON or long text, expandable
  level: 'info' | 'warn' | 'error';
}

interface DebugLogStore {
  logs: LogEntry[];
  maxLogs: number;
  filter: LogCategory | 'all';

  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setFilter: (filter: LogCategory | 'all') => void;
}

let nextId = 1;

export const useDebugLogStore = create<DebugLogStore>((set) => ({
  logs: [],
  maxLogs: 2000,
  filter: 'all',

  addLog: (entry) => {
    set((state) => {
      const newLog: LogEntry = {
        ...entry,
        id: nextId++,
        timestamp: Date.now(),
      };
      const logs = [...state.logs, newLog];
      // Trim to maxLogs
      if (logs.length > state.maxLogs) {
        return { logs: logs.slice(logs.length - state.maxLogs) };
      }
      return { logs };
    });
  },

  clearLogs: () => set({ logs: [] }),

  setFilter: (filter) => set({ filter }),
}));

/**
 * Global debug logger — call from anywhere.
 * Only logs when debug mode is enabled in settings.
 */
export function debugLog(
  category: LogCategory,
  message: string,
  detail?: unknown,
  level: 'info' | 'warn' | 'error' = 'info'
) {
  // Check if debug mode is enabled (lazy import to avoid circular deps)
  try {
    const settingsRaw = localStorage.getItem('claude-app-settings');
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      if (!settings.general?.debugMode) return;
    } else {
      return; // No settings = debug off by default
    }
  } catch {
    return;
  }

  const detailStr = detail !== undefined
    ? (typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
    : undefined;

  useDebugLogStore.getState().addLog({
    category,
    message,
    detail: detailStr,
    level,
  });

  // Also log to console in debug mode
  const prefix = `[debug:${category}]`;
  if (level === 'error') {
    console.error(prefix, message, detail ?? '');
  } else if (level === 'warn') {
    console.warn(prefix, message, detail ?? '');
  } else {
    console.log(prefix, message, detail ?? '');
  }
}
