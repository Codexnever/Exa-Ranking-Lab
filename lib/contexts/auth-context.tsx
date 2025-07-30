// lib/contexts/auth-context.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AuthContextType } from "@/lib/type";
import { useRouter } from "next/navigation";
import type { Models } from "appwrite";
import { login, register, logout, account } from "@/app/server/appwrite";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/verify-session", {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Unauthenticated")
      const data = await res.json()
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  // ✅ NEW: Auto-refresh JWT every 12 minutes (before 15-min expiration)
  useEffect(() => {
    if (!user) return

    const refreshInterval = setInterval(async () => {
      try {
        console.log('[Auth] Refreshing JWT token...')
        
        // Refresh session by calling verify-session endpoint
        await fetch("/api/verify-session", {
          credentials: "include",
        })
        
        console.log('[Auth] JWT refreshed successfully')
      } catch (error) {
        console.error('[Auth] Failed to refresh JWT:', error)
        
        // If refresh fails, logout user
        logout()
        toast.error('Session expired. Please login again.')
      }
    }, 12 * 60 * 1000) // 12 minutes

    return () => clearInterval(refreshInterval)
  }, [user])

  useEffect(() => {
    fetchUser();
  }, []);

  const loginFn = async (email: string, password: string) => {
    try {
      await login(email, password);
      await fetchUser();
      toast.success("Logged in!");
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.href = returnTo;
    } catch (err) {
      toast.error("Login failed");
      console.error("Login error:", err);
      throw err;
    }
  };

  const registerFn = async (email: string, password: string, name: string) => {
    try {
      await register(email, password, name);
      await fetchUser();
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";
      window.location.href = returnTo;
    } catch (err) {
      toast.error("Registration failed");
      console.error("Register error:", err);
      throw err;
    }
  };

  const logoutFn = async () => {
    try {
      await logout();
      setUser(null);
      
      // ✅ Clear scheduler state on logout
      localStorage.removeItem('scheduler-status')
      
      router.replace("/auth");
    } catch (err) {
      toast.error("Logout failed");
      console.error("Logout error:", err);
    }
  };

  // ✅ NEW: Manual refresh function
  const refreshSession = async () => {
    try {
      await fetchUser()
      return true
    } catch (error) {
      console.error('Session refresh failed:', error)
      return false
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.$id || null,
        loading,
        login: loginFn,
        register: registerFn,
        logout: logoutFn,
        refreshSession, // ✅ Export refresh function
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
