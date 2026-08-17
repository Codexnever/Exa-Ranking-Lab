// app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// ROOT LAYOUT — Server Component (no "use client" here).
//
// Why no "use client":
//   App Router root layout must be a Server Component to enable:
//   - Static metadata export (replaces next/head)
//   - Server-side rendering for the initial HTML shell
//   - RSC (React Server Components) for child pages
//
// All client interactivity lives in AuthProvider, AuthGate, and AppShell,
// which are individually marked "use client".
// ─────────────────────────────────────────────────────────────────────────────

import type React from "react"
import type { Metadata } from "next"
import "../styles/globals.css"
import { AuthProvider } from "@/lib/middleware/authentication/auth-context"
import { AuthGate } from "@/components/security/auth-gate"
import { AppShell } from "@/components/app-shell"
import { Toaster } from "sonner"

// ─── Metadata (App Router way — replaces next/head) ──────────────────────────
// This runs on the server, gets injected into <head> automatically.
// <Head> from next/head is the Pages Router API and does NOT work here.
export const metadata: Metadata = {
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
  metadataBase: new URL("https://yourdomain.com"),
  openGraph: {
    title: "Exa Ranking Lab",
    description:
      "Exa Ranking Lab is an open-source developer tool for analyzing and tracking Exa.ai's search ranking performance.",
    type: "website",
    url: "https://yourdomain.com",
    images: [{ url: "/og-image.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Exa Ranking Lab",
    description:
      "Exa Ranking Lab is an open-source developer tool for analyzing and tracking Exa.ai's search ranking performance.",
    images: ["/og-image.png"],
    creator: "@ChaitanyaK48841",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
}

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Performance hints — not available via metadata export */}
        <link rel="preconnect" href="https://api.exa.ai" />
        <link rel="dns-prefetch" href="https://cloud.appwrite.io" />
        <link rel="dns-prefetch" href="https://vercel.com" />
      </head>
      <body className="font-sans antialiased h-full">

        {/*
          Provider order (inside-out):
          1. AuthProvider   — establishes auth state (user, initializing, loading)
          2. AuthGate       — blocks/redirects unauthenticated access; exempts /auth
          3. AppShell       — renders Sidebar+Navbar for authenticated pages only;
                              renders nothing extra for /auth (bare page)
        */}
        <AuthProvider>
          <AuthGate>
            <AppShell>
              {children}
            </AppShell>
          </AuthGate>
        </AuthProvider>

        {/* Toaster outside AppShell so toasts show on /auth page too */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
        />

      </body>
    </html>
  )
}
