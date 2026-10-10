"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";
import { clearApiCache } from "./hooks";
import { isNetworkError, persistClear, persistGet, persistSet } from "./offline";
import type { Role } from "./types";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** True when the user has one of the roles (ADMIN always does) */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore the session from a saved token, if any
    const restore = getToken() ? api.get<SessionUser>("/auth/me") : Promise.resolve(null);
    restore
      .then((u) => {
        setUser(u);
        if (u) persistSet("/auth/me", u);
      })
      .catch((e) => {
        // No network: keep the last known session so the POS can keep billing offline
        const saved = isNetworkError(e) ? persistGet<SessionUser>("/auth/me") : null;
        if (saved) setUser(saved);
        else setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: SessionUser }>("/auth/login", { email, password });
    clearApiCache();
    setToken(res.token);
    persistSet("/auth/me", res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    persistClear();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const can = useCallback(
    (...roles: Role[]) => !!user && (user.role === "ADMIN" || roles.includes(user.role)),
    [user],
  );

  return <AuthContext.Provider value={{ user, loading, login, logout, can }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
