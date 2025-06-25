"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { account } from "@/lib/appwrite"
import type { Models } from "appwrite"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: Models.User<Models.Preferences> | null
  userId: string | null
  loading: boolean
  hasActiveSession: () => Promise<boolean>
  login: (email: string, password: string) => Promise<Models.User<Models.Preferences>>
  register: (email: string, password: string, name: string) => Promise<Models.User<Models.Preferences>>
  logout: () => Promise<void>
  updateProfile: (data: any) => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        let jwt = ''
        if (typeof window !== 'undefined') {
          jwt = localStorage.getItem('appwrite_jwt') || ''
          if (!jwt && typeof document !== 'undefined') {
            const match = document.cookie.match(/(?:^|; )appwrite_jwt=([^;]*)/)
            if (match) jwt = match[1]
          }
        }
        if (!jwt) {
          setUser(null)
          setLoading(false)
          router.replace('/auth')
          return
        }
        const res = await fetch('/api/verify-session', {
          headers: { Authorization: `Bearer ${jwt}` },
        })
        if (!res.ok) {
          setUser(null)
          setLoading(false)
          router.replace('/auth')
          return
        }
        const userData = await res.json()
        setUser(userData)
        setLoading(false)
        if (window.location.pathname === '/auth') {
          router.replace('/query-builder')
        }
      } catch {
        setUser(null)
        setLoading(false)
        router.replace('/auth')
      }
    }
    checkAuth()
  }, [router])

  const hasActiveSession = async () => {
    try {
      await account.getSession('current')
      return true
    } catch {
      return false
    }
  }

  const login = async (email: string, password: string) => {
    try {
      // Try to delete existing session, but don't fail if it doesn't exist
      try {
        await account.deleteSession("current")
      } catch (error) {
        console.error('Error to login:-', error)
      }

      await account.createEmailPasswordSession(email, password)
      const jwtRes = await account.createJWT()
      const jwt = jwtRes.jwt
      if (!jwt) throw new Error("Failed to generate JWT")

      // Store for both SSR + CSR
      localStorage.setItem("appwrite_jwt", jwt)
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
      document.cookie = `appwrite_jwt=${jwt}; Path=/; Expires=${expires}; SameSite=Strict`

      const user = await account.get()
      setUser(user)
      return user
    } catch (err) {
      setUser(null)
      throw err
    }
  }

  const register = async (email: string, password: string, name: string) => {
    await account.create("unique()", email, password, name)
    return login(email, password)
  }

  const logout = async () => {
    try {
      await account.deleteSession("current")
    } catch (err){
      toast.error('Error during logout')
      console.error('Logout error:', err)}
    localStorage.removeItem("appwrite_jwt")
    document.cookie = `appwrite_jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    setUser(null)
  }

  const updateProfile = async (data: any) => {
    try {
      const prefs = await account.updatePrefs(data)
      setUser(prev => prev ? { ...prev, prefs } : null)
    } catch (err) {
      toast.error("Update failed")
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.$id || null,
        loading,
        hasActiveSession,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}