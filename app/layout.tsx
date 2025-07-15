"use client"

import type React from "react"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../styles/globals.css"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { AuthProvider, useAuth } from "@/lib/contexts/auth-context"
import { Toaster } from "sonner"
import { Loader2 } from "lucide-react"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

const metadata = {
  title: "Exa Ranking Lab",
  description: "Open-source developer tool for analyzing and tracking Exa's search ranking performance",
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Add key cause Navbar depends on user */}
        <Navbar key={user?.$id || "guest"} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  )
}
