"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthUser, clearAuthToken } from "@/lib/api";

const USER_CACHE_KEY = "linkedin_auto_user";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  function setUser(next: AuthUser | null) {
    setUserState(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(USER_CACHE_KEY);
    }
  }

  useEffect(() => {
    // Skip the network call entirely if there's no token stored.
    // This prevents protected pages from showing a loading spinner unnecessarily,
    // and makes public pages (landing, login, signup) instant.
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("linkedin_auto_token")
        : null;

    if (!token) {
      window.localStorage.removeItem(USER_CACHE_KEY);
      setLoading(false);
      return;
    }

    // Hydrate from the cached profile immediately so a page refresh never
    // flashes the logged-out navbar while /auth/me is in flight.
    const cached = window.localStorage.getItem(USER_CACHE_KEY);
    if (cached) {
      try {
        setUserState(JSON.parse(cached) as AuthUser);
        setLoading(false);
      } catch {
        window.localStorage.removeItem(USER_CACHE_KEY);
      }
    }

    api.auth
      .me()
      .then(({ user }) => setUser(user))
      .catch((err: Error) => {
        // Only sign out when the API actually rejects the session — a network
        // blip or cold-starting API shouldn't wipe a valid login.
        if (/^API (401|403)/.test(err.message)) {
          clearAuthToken();
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.auth.logout().catch(() => {});
    clearAuthToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
