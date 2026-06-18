"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  startTransition,
  useCallback,
} from "react";
import { toast } from "sonner";
import type { AuthContextType } from "@/types/type";
import { useRouter } from "next/navigation";
import type { Models } from "appwrite";
import { login, register, logout } from "@/app/server/appwrite/appwrite";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [initializing, setInitializing] = useState(true); // true until first session check completes
  const [loading, setLoading] = useState(false);          // true only during login/logout/register actions
  const router = useRouter();

  /**
   * Fetches current session from /api/verify-session.
   * Returns the user object on success, null on failure.
   * Always sets initializing=false after the first call.
   */
  const fetchUser = useCallback(async (): Promise<Models.User<Models.Preferences> | null> => {
    try {
      const res = await fetch("/api/verify-session", {
        credentials: "include",
        cache: "no-store", // never serve a stale cached 401
      });

      if (!res.ok) {
        setUser(null);
        return null;
      }

      const data = await res.json();

      // Validate response shape before trusting it
      if (!data?.$id) {
        console.error("[Auth] Unexpected session response shape:", data);
        setUser(null);
        return null;
      }

      setUser(data);
      return data;
    } catch (err) {
      console.error("[Auth] fetchUser error:", err);
      setUser(null);
      return null;
    } finally {
      // Only cleared after the very first check — not on every refresh call
      setInitializing(false);
    }
  }, []);

  // ─── Initial session check on mount ───────────────────────────────────────
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // ─── JWT auto-refresh every 12 min (before 15-min Appwrite expiration) ────
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      console.log("[Auth] Auto-refreshing JWT...");
      const refreshed = await fetchUser();

      if (!refreshed) {
        console.warn("[Auth] JWT refresh failed — logging out");
        toast.error("Session expired. Please login again.");
        await logout().catch(() => {});
        setUser(null);
        startTransition(() => {
          router.replace("/auth");
        });
      } else {
        console.log("[Auth] JWT refreshed successfully");
      }
    }, 12 * 60 * 1000); // 12 minutes

    return () => clearInterval(interval);
  }, [user, fetchUser, router]);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const loginFn = async (email: string, password: string) => {
    setLoading(true);
    try {
      await login(email, password);

      // fetchUser both sets state AND returns the user so we can verify
      const userData = await fetchUser();

      if (!userData) {
        throw new Error("Session not established after login");
      }

      toast.success("Logged in!");

      const returnTo =
        new URLSearchParams(window.location.search).get("returnTo") || "/";

      // startTransition defers navigation until React has committed the auth state update
      startTransition(() => {
        router.replace(returnTo);
      });
    } catch (err) {
      toast.error("Login failed");
      console.error("[Auth] Login error:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ─── Register ──────────────────────────────────────────────────────────────
  const registerFn = async (email: string, password: string, name: string) => {
    setLoading(true);
    try {
      await register(email, password, name);

      const userData = await fetchUser();

      if (!userData) {
        throw new Error("Session not established after registration");
      }

      const returnTo =
        new URLSearchParams(window.location.search).get("returnTo") || "/";

      startTransition(() => {
        router.replace(returnTo);
      });
    } catch (err) {
      toast.error("Registration failed");
      console.error("[Auth] Register error:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logoutFn = async () => {
    setLoading(true);
    try {
      await logout();
      setUser(null);
      localStorage.removeItem("scheduler-status");

      startTransition(() => {
        router.replace("/auth");
      });
    } catch (err) {
      toast.error("Logout failed");
      console.error("[Auth] Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.$id || null,
        initializing, // expose so AuthGate can block renders until auth is known
        loading,      // expose so forms can show spinner during login/register/logout
        login: loginFn,
        register: registerFn,
        logout: logoutFn,
        refreshSession: async () => (await fetchUser()) !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within AuthProvider");
  return auth;
}