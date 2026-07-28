// app/auth/page.tsx
"use client"

import dynamic from "next/dynamic"

const AuthForm = dynamic(() => import("./AuthForm"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  ),
})

export default function AuthPage() {
  return <AuthForm />
}