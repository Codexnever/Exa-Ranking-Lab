"use client"

import { useAuth } from "@/lib/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AuthRedirect } from "./AuthRedirect"

export default function AuthForm() {
  const { user, login, register, loading: authLoading } = useAuth()
  const router = useRouter()

  const [formData, setFormData] = useState({ email: "", password: "", name: "" })
  const [isSignUp, setIsSignUp] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formLoading || authLoading) return

    setFormLoading(true)
    try {
      if (isSignUp) {
        await register(formData.email, formData.password, formData.name)
        toast.success("Account created! Redirecting...")
      } else {
        console.log('formdata', formData)
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
  <>
    <AuthRedirect />
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <img src="/placeholder-logo.svg" alt="Exa Ranking Lab" className="h-12 mb-2" />
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{isSignUp ? "Create Account" : "Sign In"}</h1>
          <p className="text-gray-500 text-sm">
            {isSignUp
              ? "Join Exa Ranking Lab to unlock analytics."
              : "Welcome back! Log in to your dashboard."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <input
              type="text"
              placeholder="Full Name"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none text-gray-900 bg-gray-50"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none text-gray-900 bg-gray-50"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none text-gray-900 bg-gray-50"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold shadow hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-60"
            disabled={formLoading}
          >
            {formLoading ? "Please wait..." : isSignUp ? "Sign Up" : "Login"}
          </button>
        </form>

        <div className="text-sm mt-6 text-center text-gray-600">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            className="underline text-blue-600 hover:text-indigo-600 font-medium"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? "Login here" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  </>
)
}
