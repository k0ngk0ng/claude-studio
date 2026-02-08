import { create } from 'zustand';

const STORAGE_KEY = 'claude-app-allowed-tools';

export interface PermissionRequest {
  id: string;
  toolName: string;       // e.g. "Bash"
  command: string;        // e.g. "git add src/..."
  toolPattern: string;    // e.g. "Bash(git add *)"
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

interface PermissionStore {
  // Persistent allowed tool patterns (survive across sessions)
  allowedTools: string[];
  // Pending permission requests shown in chat
  pendingRequests: PermissionRequest[];

  // Actions
  addRequest: (request: PermissionRequest) => void;
  approveRequest: (id: string) => void;
  denyRequest: (id: string) => void;
  clearRequests: () => void;
  addAllowedTool: (pattern: string) => void;
  removeAllowedTool: (pattern: string) => void;
  clearAllowedTools: () => void;
}

function loadAllowedTools(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveAllowedTools(tools: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch { /* ignore */ }
}

/**
 * Extract a tool pattern from a denied command.
 * e.g. "git add src/foo.ts src/bar.ts" → "Bash(git add *)"
 * e.g. "git commit -m 'message'" → "Bash(git commit *)"
 * e.g. "cd /path && git add -A" → "Bash(git add *)"
 * e.g. "npm install" → "Bash(npm install *)"
 */
export function extractToolPattern(toolName: string, command: string): string {
  if (toolName !== 'Bash') {
    return toolName;
  }

  // Handle chained commands: split on && or ; and find the meaningful command
  // Skip "cd ..." prefixes which are just directory changes
  const segments = command.split(/\s*&&\s*|\s*;\s*/).map(s => s.trim()).filter(Boolean);
  let mainCommand = command.trim();

  for (const seg of segments) {
    const first = seg.split(/\s+/)[0];
    // Skip cd, pushd, popd — they're just directory changes
    if (!['cd', 'pushd', 'popd'].includes(first)) {
      mainCommand = seg;
      break;
    }
  }

  const parts = mainCommand.split(/\s+/);
  if (parts.length === 0) return `Bash(*)`;

  // For git commands, use "git <subcommand> *"
  if (parts[0] === 'git' && parts.length > 1) {
    return `Bash(git ${parts[1]} *)`;
  }

  // For npm/yarn/pnpm commands, use "<pkg> <subcommand> *"
  if (['npm', 'yarn', 'pnpm', 'npx', 'bun'].includes(parts[0]) && parts.length > 1) {
    return `Bash(${parts[0]} ${parts[1]} *)`;
  }

  // For other commands, use "<command> *"
  return `Bash(${parts[0]} *)`;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  allowedTools: loadAllowedTools(),
  pendingRequests: [],

  addRequest: (request) =>
    set((state) => ({
      pendingRequests: [...state.pendingRequests, request],
    })),

  approveRequest: (id) => {
    const state = get();
    const request = state.pendingRequests.find(r => r.id === id);
    if (!request) return;

    // Add the tool pattern to allowed list (deduplicate)
    const pattern = request.toolPattern;
    const newAllowed = state.allowedTools.includes(pattern)
      ? state.allowedTools
      : [...state.allowedTools, pattern];
    saveAllowedTools(newAllowed);

    set({
      allowedTools: newAllowed,
      pendingRequests: state.pendingRequests.map(r =>
        r.id === id ? { ...r, status: 'approved' as const } : r
      ),
    });

    // Notify useClaude to re-spawn the process with updated allowedTools
    window.dispatchEvent(new CustomEvent('claude:permission-approved', {
      detail: { pattern, allowedTools: newAllowed },
    }));
  },

  denyRequest: (id) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.map(r =>
        r.id === id ? { ...r, status: 'denied' as const } : r
      ),
    })),

  clearRequests: () => set({ pendingRequests: [] }),

  addAllowedTool: (pattern) => {
    const state = get();
    if (state.allowedTools.includes(pattern)) return;
    const newAllowed = [...state.allowedTools, pattern];
    saveAllowedTools(newAllowed);
    set({ allowedTools: newAllowed });
  },

  removeAllowedTool: (pattern) => {
    const state = get();
    const newAllowed = state.allowedTools.filter(t => t !== pattern);
    saveAllowedTools(newAllowed);
    set({ allowedTools: newAllowed });
  },

  clearAllowedTools: () => {
    saveAllowedTools([]);
    set({ allowedTools: [] });
  },
}));
