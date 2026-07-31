"use client"

import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { useState } from "react"
import { toast } from "sonner"
import { AuthRedirect } from "./AuthRedirect"
import { TrendingUp, Search, BarChart3, Zap, Shield, Activity } from "lucide-react"

/**
 * AuthForm — login and registration form.
 * Logic unchanged from original — only visual layer replaced.
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
        await register(formData.email, formData.password, formData.name)
        toast.success("Account created! Redirecting...")
      } else {
        await login(formData.email, formData.password)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed")
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <>
      <AuthRedirect />

      <div className="min-h-screen flex bg-[#0A0F1E]">

        {/* ── Left panel — brand + feature highlights ── */}
        <div className="hidden lg:flex flex-col justify-between w-[52%] p-14"
          style={{
            background: "linear-gradient(135deg, #0A0F1E 0%, #0F1A3E 50%, #091228 100%)",
            borderRight: "1px solid rgba(59,130,246,0.12)"
          }}>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)" }}
            >
              E
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">
              Exa Ranking Lab
            </span>
          </div>

          {/* Hero text */}
          <div className="space-y-6">
            <div>
              <p className="text-blue-400 text-xs font-semibold tracking-widest uppercase mb-4">
                Search Intelligence Platform
              </p>
              <h1 className="text-white font-bold leading-[1.1]"
                style={{ fontSize: "clamp(2rem, 3.5vw, 2.8rem)" }}>
                Know why your<br />
                <span style={{
                  background: "linear-gradient(90deg, #60a5fa, #818cf8)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent"
                }}>
                  rankings drift.
                </span>
              </h1>
              <p className="text-slate-400 mt-5 text-base leading-relaxed max-w-sm">
                Semantic drift detection powered by Gemini embeddings and
                Weaviate vector search. Position tracking is table stakes —
                this goes deeper.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-3 pt-2">
              {[
                {
                  icon: Activity,
                  label: "Semantic drift detection",
                  sub: "Content changes, not just position changes"
                },
                {
                  icon: Search,
                  label: "Decomposed drift types",
                  sub: "Content · Competitor · Re-rank — all separated"
                },
                {
                  icon: BarChart3,
                  label: "Algorithm update alerts",
                  sub: "Coordinated drift signals a systemic change"
                },
                {
                  icon: Zap,
                  label: "Real-time monitoring",
                  sub: "Scheduled snapshots with instant threshold alerts"
                },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(59,130,246,0.2)" }}>
                    <Icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-slate-200 text-sm font-medium leading-tight">{label}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom badge */}
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-600" />
            <span className="text-slate-600 text-xs">
              Built on Exa.ai · Weaviate · Gemini
            </span>
          </div>
        </div>

        {/* ── Right panel — auth form ── */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-14">
          <div className="w-full max-w-sm space-y-8">

            {/* Mobile logo */}
            <div className="flex items-center gap-2 lg:hidden">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)" }}
              >
                E
              </div>
              <span className="text-white font-semibold text-base">Exa Ranking Lab</span>
            </div>

            {/* Header */}
            <div>
              <h2 className="text-white font-bold text-2xl tracking-tight">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-slate-400 text-sm mt-1.5">
                {isSignUp
                  ? "Start tracking semantic SERP drift today."
                  : "Sign in to your dashboard."}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Full name
                  </label>
                  <input
                    type="text"
                    placeholder="Your name"
                    className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-slate-600 outline-none transition focus:ring-1 focus:ring-blue-500"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)"
                    }}
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    autoFocus
                    disabled={isLoading}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-slate-600 outline-none transition focus:ring-1 focus:ring-blue-500"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-slate-600 outline-none transition focus:ring-1 focus:ring-blue-500"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)"
                  }}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white transition mt-2"
                style={{
                  background: isLoading
                    ? "rgba(37,99,235,0.4)"
                    : "linear-gradient(135deg, #2563eb, #4f46e5)",
                  boxShadow: isLoading ? "none" : "0 0 24px rgba(37,99,235,0.3)"
                }}
              >
                {isLoading
                  ? "Please wait..."
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            {/* Toggle */}
            <p className="text-center text-sm text-slate-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => setIsSignUp(s => !s)}
                disabled={isLoading}
                className="text-blue-400 hover:text-blue-300 font-medium transition"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>

          </div>
        </div>
      </div>
    </>
  )
}