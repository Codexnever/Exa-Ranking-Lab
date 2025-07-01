"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import type { Models } from "appwrite"
import { account } from "@/lib/appwrite"

interface AuthContextType {
  user: Models.User<Models.Preferences> | null
  userId: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

const fetchUser = async () => {
  try {
    const res = await fetch("/api/verify-session", {
      credentials: "include", // 👈 super important
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
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email, password }),
        headers: { "Content-Type": "application/json" },
      })
      console.log("Login response:", res)
      if (!res.ok) throw new Error("Invalid login")
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
      const res = await fetch("/api/register", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email, password, name }),
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error("Registration failed")
      toast.success("Account created!")
      await fetchUser()
      router.replace("/query-builder")
    } catch (err) {
      toast.error("Registration failed")
      throw err
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" })
    } catch {}
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
