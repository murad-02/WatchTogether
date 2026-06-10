import { create } from 'zustand';
import type { User } from '@/lib/types';
import { api, clearToken, getToken, setToken } from '@/lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  /** Restore the session from a persisted token on app load. */
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api.login({ email, password });
      setToken(res.accessToken);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  register: async (username, email, password) => {
    set({ loading: true });
    try {
      const res = await api.register({ username, email, password });
      setToken(res.accessToken);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },

  hydrate: async () => {
    const token = getToken();
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      const user = await api.me();
      set({ user });
    } catch {
      clearToken();
    } finally {
      set({ initialized: true });
    }
  },
}));
