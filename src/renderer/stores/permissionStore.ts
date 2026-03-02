import { create } from 'zustand';
import { useAppStore } from './appStore';

export interface PermissionRequest {
  id: string;          // Same as requestId from CLI — used to respond
  toolName: string;    // e.g. "Bash"
  command: string;     // e.g. "git add src/..."
  toolPattern: string; // e.g. "Bash(git add *)" — for display
  input: Record<string, unknown>; // Original tool input from CLI
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

interface PermissionStore {
  // Pending permission requests shown in chat
  pendingRequests: PermissionRequest[];

  // Actions
  addRequest: (request: PermissionRequest) => void;
  approveRequest: (id: string) => void;
  approveAllPending: () => void;
  denyRequest: (id: string) => void;
  clearRequests: () => void;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  pendingRequests: [],

  addRequest: (request) =>
    set((state) => ({
      pendingRequests: [...state.pendingRequests, request],
    })),

  approveRequest: (id) => {
    const state = get();
    const request = state.pendingRequests.find(r => r.id === id);
    if (!request || request.status !== 'pending') return;

    // Mark as approved in UI
    set({
      pendingRequests: state.pendingRequests.map(r =>
        r.id === id ? { ...r, status: 'approved' as const } : r
      ),
    });

    // Send approval to main process → CLI permission resolver
    const processId = useAppStore.getState().currentSession.processId;
    if (processId) {
      window.api.claude.respondToPermission(processId, id, {
        behavior: 'allow',
        updatedInput: request.input,
      });
    }

    // Remove from list after brief flash
    setTimeout(() => {
      set((s) => ({
        pendingRequests: s.pendingRequests.filter(r => r.id !== id),
      }));
    }, 1500);
  },

  denyRequest: (id) => {
    const state = get();
    const request = state.pendingRequests.find(r => r.id === id);
    if (!request || request.status !== 'pending') return;

    // Send denial to main process → CLI permission resolver
    const processId = useAppStore.getState().currentSession.processId;
    if (processId) {
      window.api.claude.respondToPermission(processId, id, {
        behavior: 'deny',
        message: 'User denied this action',
      });
    }

    // Remove immediately
    set({
      pendingRequests: state.pendingRequests.filter(r => r.id !== id),
    });
  },

  approveAllPending: () => {
    const state = get();
    const pending = state.pendingRequests.filter(r => r.status === 'pending');
    if (pending.length === 0) return;

    const processId = useAppStore.getState().currentSession.processId;

    // Mark all as approved
    set({
      pendingRequests: state.pendingRequests.map(r =>
        r.status === 'pending' ? { ...r, status: 'approved' as const } : r
      ),
    });

    // Send approval for each pending request
    for (const req of pending) {
      if (processId) {
        window.api.claude.respondToPermission(processId, req.id, {
          behavior: 'allow',
          updatedInput: req.input,
        });
      }
    }

    // Remove all after brief flash
    setTimeout(() => {
      set((s) => ({
        pendingRequests: s.pendingRequests.filter(r => r.status === 'pending'),
      }));
    }, 1500);
  },

  clearRequests: () => {
    // Deny any still-pending requests before clearing
    const state = get();
    const processId = useAppStore.getState().currentSession.processId;
    for (const req of state.pendingRequests) {
      if (req.status === 'pending' && processId) {
        window.api.claude.respondToPermission(processId, req.id, {
          behavior: 'deny',
          message: 'Session cleared',
        });
      }
    }
    set({ pendingRequests: [] });
  },
}));
