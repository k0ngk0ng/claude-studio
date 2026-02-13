import { create } from 'zustand';
import type { User, AuthResult } from '../types';
import { pullFromServer } from './settingsStore';

const TOKEN_KEY = 'claude-studio-auth-token';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  showLoginModal: boolean;

  // Actions
  login: (emailOrUsername: string, password: string) => Promise<AuthResult>;
  register: (email: string, username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;
  updateProfile: (updates: { username?: string; avatarUrl?: string }) => Promise<AuthResult>;
  setShowLoginModal: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  showLoginModal: false,

  login: async (emailOrUsername: string, password: string) => {
    const result = await window.api.auth.login(emailOrUsername, password);
    if (result.success && result.user && result.token) {
      localStorage.setItem(TOKEN_KEY, result.token);
      set({ user: result.user as User, token: result.token, showLoginModal: false });
      pullFromServer();
    }
    return result;
  },

  register: async (email: string, username: string, password: string) => {
    const result = await window.api.auth.register(email, username, password);
    if (result.success && result.user && result.token) {
      localStorage.setItem(TOKEN_KEY, result.token);
      set({ user: result.user as User, token: result.token, showLoginModal: false });
      pullFromServer();
    }
    return result;
  },

  logout: async () => {
    const { token } = get();
    if (token) {
      await window.api.auth.logout(token).catch(() => {});
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ user: null, token: null });
  },

  validateSession: async () => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      set({ isLoading: false });
      return;
    }
    try {
      const result = await window.api.auth.validate(savedToken);
      if (result.success && result.user) {
        set({ user: result.user as User, token: savedToken, isLoading: false });
      } else {
        localStorage.removeItem(TOKEN_KEY);
        set({ isLoading: false });
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates) => {
    const { token } = get();
    if (!token) return { success: false, error: 'Not logged in' };
    const result = await window.api.auth.updateProfile(token, updates);
    if (result.success && result.user) {
      set({ user: result.user as User });
    }
    return result;
  },

  setShowLoginModal: (show: boolean) => set({ showLoginModal: show }),
}));
