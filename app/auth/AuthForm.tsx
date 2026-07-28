"use client"

import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useState } from "react"
import { toast } from "sonner"
import { AuthRedirect } from "./AuthRedirect"

/**
 * AuthForm — login and registration form.
 *
 * Key rules:
 * - login() and register() in AuthContext already handle navigation internally
 *   via startTransition + router.replace. Do NOT call router.replace here too —
 *   that causes a double-navigation race condition.
 * - Use `loading` (action loading) only to disable the submit button.
 *   Never gate the entire form render on `loading` — it shows "Loading..."
 *   during the login button click itself, which is wrong.
 * - Use `initializing` only in AuthRedirect (session check on page load).
 */
export default function AuthForm() {
  const { login, register, loading: authLoading } = useAuth()

  const [formData, setFormData] = useState({ email: "", password: "", name: "" })
  const [isSignUp, setIsSignUp] = useState(false)
  const [formLoading, setFormLoading] = useState(false)

  const isLoading = formLoading || authLoading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    if (!formData.email || !formData.password) {
      toast.error("Email and password are required")
      return
    }

    setFormLoading(true)
    try {
      if (isSignUp) {
        // register() in AuthContext handles navigation after success
        await register(formData.email, formData.password, formData.name)
        toast.success("Account created! Redirecting...")
      } else {
        // login() in AuthContext handles navigation after success —
        // do NOT call router.replace() here, that's a double navigation
        await login(formData.email, formData.password)
      }
    } catch (error) {
      // login()/register() re-throw on failure so we can show the error
      toast.error(error instanceof Error ? error.message : "Authentication failed")
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <>
      {/* Handles redirect if user lands on /auth while already logged in */}
      <AuthRedirect />

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl border border-gray-100">

          <div className="flex flex-col items-center mb-6">
            <img src="/placeholder-logo.svg" alt="Exa Ranking Lab" className="h-12 mb-2" />
            <h1 className="text-3xl font-bold text-gray-900 mb-1">
              {isSignUp ? "Create Account" : "Sign In"}
            </h1>
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
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
                disabled={isLoading}
              />
            )}

            <input
              type="email"
              placeholder="Email address"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none text-gray-900 bg-gray-50"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              autoComplete="email"
              disabled={isLoading}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 focus:outline-none text-gray-900 bg-gray-50"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              disabled={isLoading}
            />

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold shadow hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading
                ? "Please wait..."
                : isSignUp
                  ? "Sign Up"
                  : "Login"}
            </button>
          </form>

          <div className="text-sm mt-6 text-center text-gray-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              className="underline text-blue-600 hover:text-indigo-600 font-medium"
              onClick={() => setIsSignUp(s => !s)}
              disabled={isLoading}
            >
              {isSignUp ? "Login here" : "Sign up"}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}