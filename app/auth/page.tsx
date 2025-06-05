"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export default function AuthPage() {
  const { user, login, register, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [formData, setFormData] = useState({ email: "", password: "", name: "" })
  const [isSignUp, setIsSignUp] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      const returnTo = searchParams.get("returnTo") || "/query-builder"
      router.replace(returnTo)
    }
  }, [user, authLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formLoading || authLoading) return

    setFormLoading(true)
    try {
      if (isSignUp) {
        await register(formData.email, formData.password, formData.name)
        toast.success("Account created! Redirecting...")
      } else {
        if (!formData.email || !formData.password) {
          toast.error("Email and password are required")
          return
        }
        await login(formData.email, formData.password)
        toast.success("Logged in! Redirecting...")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed")
    } finally {
      setFormLoading(false)
    }
  }

  if (authLoading) return <div className="p-4">Loading...</div>

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-xl shadow-md">
      <h1 className="text-2xl font-semibold mb-6">{isSignUp ? "Sign Up" : "Login"}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <input
            type="text"
            placeholder="Name"
            className="w-full px-3 py-2 border rounded"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          className="w-full px-3 py-2 border rounded"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full px-3 py-2 border rounded"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        />
        <button
          type="submit"
          className="w-full bg-black text-white py-2 rounded hover:bg-gray-800"
          disabled={formLoading}
        >
          {formLoading ? "Please wait..." : isSignUp ? "Sign Up" : "Login"}
        </button>
      </form>
      <div className="text-sm mt-4 text-center">
        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          className="underline text-blue-600"
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? "Login here" : "Sign up"}
        </button>
      </div>
    </div>
  )
}
