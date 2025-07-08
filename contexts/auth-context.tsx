"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"
import type { AuthContextType } from "@/lib/types"
import { useRouter } from "next/navigation"
import type { Models } from "appwrite"
import { account } from "@/lib/appwrite" // ✅ Server-side SDK


const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

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
    fetchUser()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      await account.createEmailPasswordSession(email, password)
      const { jwt } = await account.createJWT()

      await fetch("/api/set-cookie", {
        method: "POST",
        body: JSON.stringify({ jwt }),
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })

      toast.success("Logged in!")
      await fetchUser()
      window.location.href = "/query-builder"
    } catch (err) {
      toast.error("Login failed")
      throw err
    }
  }

  const register = async (email: string, password: string, name: string) => {
    try {
      // 1. Create account on Appwrite
      await account.create("unique()", email, password, name)

      // 2. Create session (login the user)
      await account.createEmailPasswordSession(email, password)

      // 3. Generate JWT
      const { jwt } = await account.createJWT()

      // 4. Set JWT in HttpOnly cookie via API route
      await fetch("/api/set-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jwt }),
      })

      // 5. Fetch user from /api/verify-session
      await fetchUser()

      // 6. Redirect
      window.location.href = "/query-builder"
    } catch (err) {
      toast.error("Registration failed")
      console.error("Register error:", err)
      throw err
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" })
    } catch { }
    setUser(null)
    router.replace("/auth")
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.$id || null,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
