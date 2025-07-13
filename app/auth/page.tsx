"use client"

import { AuthProvider } from "@/lib/contexts/auth-context"
import dynamic from "next/dynamic"

const AuthForm = dynamic(() => import("./AuthForm"), {
  ssr: false,
})

export default function AuthPage() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex items-center justify-center">
        <AuthForm />
      </div>
    </AuthProvider>
  )
}
