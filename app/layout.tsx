"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { Inter, JetBrains_Mono } from "next/font/google"
import "../styles/globals.css"
import Sidebar from "@/components/sidebar"
import Navbar from "@/components/navbar"
import { AuthProvider, useAuth } from "@/lib/contexts/auth-context"
import { Toaster } from "sonner"
import Head from "next/head"
import { ErrorBoundary } from 'react-error-boundary'
import { RealTimeProvider } from "@/components/providers/RealTimeProvider"
import { ConnectionHealthProvider } from "@/components/providers/ConnectionHealthProvider"

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
    "exa.ai",
  ],
  url: "https://yourdomain.com",
  image: "https://yourdomain.com/og-image.png",
  twitterHandle: "@ChaitanyaK48841",
}

// Error Fallback for Real-Time Issues
function RealTimeErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div className="fixed top-4 right-4 max-w-md p-4 border-l-4 border-amber-400 bg-amber-50 rounded shadow-lg z-50">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-amber-800">Real-time Connection Issue</h3>
          <p className="mt-1 text-xs text-amber-700">{error.message}</p>
          <button
            onClick={resetErrorBoundary}
            className="mt-2 text-xs text-amber-800 underline hover:text-amber-900"
          >
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  );
}

// Main App Loading Component
function AppLoading() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <div className="absolute inset-0 h-12 w-12 rounded-md bg-blue-600 animate-pulse opacity-75"></div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">Loading Exa Ranking Lab</p>
          <p className="text-xs text-gray-500 mt-1">Initializing real-time connections...</p>
        </div>
      </div>
    </div>
  );
}

// Client-only shell for authenticated app experience
function ClientAppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const user = auth.user;
  const loading = auth.loading;
  const [appReady, setAppReady] = useState(false);

  // Initialize app readiness
  useEffect(() => {
    if (!loading) {
      // Small delay to ensure all providers are ready
      const timer = setTimeout(() => setAppReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (loading || !appReady) {
    return <AppLoading />;
  }

  return (
    <ErrorBoundary 
      FallbackComponent={RealTimeErrorFallback}
      onError={(error) => {
        console.error('[Layout] Real-time error:', error);
      }}
      onReset={() => {
        // Optional: Reset any global state or reconnect
        window.location.reload();
      }}
    >
      <ConnectionHealthProvider>
        <RealTimeProvider>
          <div className="flex h-screen overflow-hidden bg-gray-50">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <Navbar key={user?.$id || "guest"} />
              <main className="flex-1 overflow-y-auto bg-slate-50">
                <div className="p-6">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </RealTimeProvider>
      </ConnectionHealthProvider>
    </ErrorBoundary>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <ClientAppShell>{children}</ClientAppShell>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
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
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased h-full`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster 
            position="top-right" 
            richColors
            closeButton
            duration={4000}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
