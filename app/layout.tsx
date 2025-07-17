"use client"

import type React from "react"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../styles/globals.css"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { AuthProvider, useAuth } from "@/lib/contexts/auth-context"
import { Toaster } from "sonner"
import { Loader2 } from "lucide-react"
import Head from "next/head"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" })


const metadata = {
  title: "Exa Ranking Lab",
  description:
    "Exa Ranking Lab is an open-source developer tool for analyzing and tracking Exa.ai's search ranking performance. Run A/B tests, benchmark changes, and gain insights into your search engine's behavior.",
  keywords: [
    "Exa ranking lab",
    "Exa AI search analytics",
    "search ranking tracker",
    "SERP monitoring tool",
    "SEO analytics platform",
    "ranking analysis software",
    "search performance tracking",
    "competitor ranking analysis",
    "content optimization tool",
    "search intelligence platform",
    "ranking volatility tracker",
    "search result monitoring",
    "SEO ranking tool",
    "search analytics dashboard",
    "ranking comparison tool",
    "search trend analysis",
    "SERP tracking software",
    "search ranking insights",
    "AI search optimization",
    "search performance metrics",
  ],
  url: "https://yourdomain.com", // Replace with actual domain
  image: "https://yourdomain.com/og-image.png", // Replace with actual OG imag should be 1200x630 for best previews on Slack/FB/LinkedIn

  twitterHandle: "@ChaitanyaK48841", 
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600">Loading Exa Ranking Lab...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar key={user?.$id || "guest"} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <Head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />
        <meta name="keywords" content={metadata.keywords.join(", ")} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={metadata.url} />
        <link rel="icon" href="/favicon.ico" />

        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.exa.ai" />

        {/* DNS prefetch for better performance */}
        <link rel="dns-prefetch" href="https://cloud.appwrite.io" />
        <link rel="dns-prefetch" href="https://vercel.com" />

        {/* Open Graph (OG) */}
        <meta property="og:title" content={metadata.title} />
        <meta property="og:description" content={metadata.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={metadata.url} />
        <meta property="og:image" content={metadata.image} />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metadata.title} />
        <meta name="twitter:description" content={metadata.description} />
        <meta name="twitter:image" content={metadata.image} />
        {metadata.twitterHandle && <meta name="twitter:creator" content={metadata.twitterHandle} />}

        {/* Robots */}
        <meta name="robots" content="index, follow" />
      </Head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  )
}
