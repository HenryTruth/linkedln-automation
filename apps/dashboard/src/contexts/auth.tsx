"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthUser, setAuthToken, clearAuthToken } from "@/lib/api";

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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip the network call entirely if there's no token stored.
    // This prevents protected pages from showing a loading spinner unnecessarily,
    // and makes public pages (landing, login, signup) instant.
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("linkedin_auto_token")
        : null;

    if (!token) {
      setLoading(false);
      return;
    }

    api.auth
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
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
