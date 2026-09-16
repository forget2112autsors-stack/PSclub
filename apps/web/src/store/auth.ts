import { create } from 'zustand';

import { api, getToken, setToken } from '../lib/api.ts';

export type Role = 'OPERATOR' | 'ADMIN' | 'OWNER';

export interface CurrentUser {
  sub: string;
  name: string;
  role: Role;
  clubId: string;
}

interface AuthState {
  user: CurrentUser | null;
  checked: boolean;
  login: (userId: string, pin: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  checked: false,

  login: async (userId, pin) => {
    const result = await api<{ token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId, pin }),
    });
    setToken(result.token);
    set({ user: result.user, checked: true });
  },

  logout: () => {
    setToken(null);
    set({ user: null, checked: true });
  },

  restore: async () => {
    if (!getToken()) {
      set({ user: null, checked: true });
      return;
    }
    try {
      const result = await api<{ user: CurrentUser }>('/api/me');
      set({ user: result.user, checked: true });
    } catch {
      setToken(null);
      set({ user: null, checked: true });
    }
  },
}));

export function isManager(user: CurrentUser | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'OWNER';
}
