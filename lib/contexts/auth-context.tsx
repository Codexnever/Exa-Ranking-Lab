// lib/contexts/auth-context.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AuthContextType } from "@/lib/type";
import { useRouter } from "next/navigation";
import type { Models } from "appwrite";
import { login, register, logout} from "@/app/server/appwrite";

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

  useEffect(() => {
    fetchUser();
  }, []);

  const loginFn = async (email: string, password: string) => {
    try {
      await login(email, password); // Calls the fixed function (session + JWT + cookie)
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
      router.replace("/auth");
    } catch (err) {
      toast.error("Logout failed");
      console.error("Logout error:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.$id || null,
        loading,
        login: loginFn,
        register: registerFn,
        logout: logoutFn,
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
