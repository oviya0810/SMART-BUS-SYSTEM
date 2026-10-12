import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, api, setCsrfToken } from '../services/api';
import type { Role, User } from '../services/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, role?: Role) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<User>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User; csrf_token: string }>('/api/auth/me');
      setCsrfToken(res.csrf_token);
      setUser(res.user);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status === 401) {
        setUser(null);
        setCsrfToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      setUser(null);
      setCsrfToken(null);
    };
    const onPwRequired = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener('smartbus:unauthorized', onUnauthorized);
    window.addEventListener('smartbus:password-change-required', onPwRequired);
    return () => {
      window.removeEventListener('smartbus:unauthorized', onUnauthorized);
      window.removeEventListener('smartbus:password-change-required', onPwRequired);
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string, role?: Role) => {
    const res = await api<{ user: User; csrf_token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password, role },
    });
    setCsrfToken(res.csrf_token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* session may already be gone */
    }
    setCsrfToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const res = await api<{ user: User; csrf_token: string }>('/api/auth/change-password', {
      method: 'POST',
      body: { current_password: current, new_password: next },
    });
    setCsrfToken(res.csrf_token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, changePassword, refresh }), [user, loading, login, logout, changePassword, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const homeFor = (role: Role) => `/${role}`;
