"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "sonner"
import type { AuthContextType } from "@/lib/type"
import { useRouter } from "next/navigation"
import type { Models } from "appwrite"
import { account, client } from "@/app/server/appwrite"

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
      console.log("Fetched user", data)

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
      await account.deleteSession('current') // Ensure no previous session exists
      await account.createEmailPasswordSession(email, password)
      let jwt
      try {
        const jwtRes = await account.createJWT()
        jwt = jwtRes.jwt
        if (!jwt) throw new Error('JWT not generated')
        client.setJWT(jwt)
      } catch (jwtErr) {
        toast.error("Failed to generate JWT. Please try again.")
        console.error("JWT generation error:", jwtErr)
        throw jwtErr
      }
      try {
        const res = await fetch("/api/set-cookie", {
          method: "POST",
          body: JSON.stringify({ jwt }),
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Failed to set cookie: ${errText}`)
        }
      } catch (cookieErr) {
        toast.error("Failed to set session cookie. Please try again.")
        console.error("Set-cookie error:", cookieErr)
        throw cookieErr
      }
      toast.success("Logged in!")
      await fetchUser()

      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/"
      window.location.href = returnTo
    } catch (err) {
      toast.error("Login failed")
      console.error("Login error:", err)
      throw err
    }
  }

  const register = async (email: string, password: string, name: string) => {
    try {
      await account.deleteSession('current')
      // 1. Create account on Appwrite
      await account.create("unique()", email, password, name)

      // 2. Create session (login the user)
      await account.createEmailPasswordSession(email, password)

      // 3. Generate JWT
      let jwt
      try {
        const jwtRes = await account.createJWT()
        jwt = jwtRes.jwt
        if (!jwt) throw new Error('JWT not generated')
      } catch (jwtErr) {
        toast.error("Failed to generate JWT. Please try again.")
        console.error("JWT generation error:", jwtErr)
        throw jwtErr
      }

      // 4. Set JWT in HttpOnly cookie via API route
      try {
        const res = await fetch("/api/set-cookie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ jwt }),
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Failed to set cookie: ${errText}`)
        }
      } catch (cookieErr) {
        toast.error("Failed to set session cookie. Please try again.")
        console.error("Set-cookie error:", cookieErr)
        throw cookieErr
      }

      // 5. Fetch user from /api/verify-session
      await fetchUser()
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/"
      window.location.href = returnTo

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
