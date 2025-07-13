import type React from "react"
import type { Metadata } from "next/types"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../styles/globals.css"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { AuthProvider } from "@/lib/contexts/auth-context"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "Exa Ranking Lab",
  description: "Open-source developer tool for analyzing and tracking Exa's search ranking performance",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <Navbar />
              <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
            </div>
          </div>
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  )
}
