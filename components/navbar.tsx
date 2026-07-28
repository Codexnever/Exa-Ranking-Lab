"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, Plus, Search, User, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { toast } from "sonner"
import { NotificationBell } from "@/components/ui/NotificationBell"

interface SearchableRoute {
  label: string
  href: string
}

const ROUTES: SearchableRoute[] = [
  { label: "Dashboard", href: "/" },
  { label: "Query Builder", href: "/query-builder" },
  { label: "Query Monitor", href: "/query-monitor" },
  { label: "Analytics", href: "/analytics" },
  { label: "Snapshots", href: "/snapshots" },
  { label: "Compare Rankings", href: "/compare" },
  { label: "Feedback", href: "/feedback" },
  { label: "Settings", href: "/settings" },
  { label: "Profile", href: "/profile" },
]

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/query-builder": "Query Builder",
  "/query-monitor": "Query Monitor",
  "/analytics": "Analytics",
  "/snapshots": "Snapshots",
  "/compare": "Compare Rankings",
  "/feedback": "Feedback",
  "/settings": "Settings",
}

export default function Navbar() {
  const router = useRouter()
  // ✅ Called ONCE at the top level — previously called a second time
  // inside getPageTitle(), shadowing this variable with a redeclared
  // local one. The outer `pathname` was fetched but never actually used
  // anywhere; getPageTitle() always read its own internal redeclaration.
  // Same hook, same value, called twice for no reason — now a single
  // source of truth.
  const pathname = usePathname()

  const [searchQuery, setSearchQuery] = useState("")
  // ✅ Typed instead of any[] — matches the actual shape pushed into it
  const [searchResults, setSearchResults] = useState<SearchableRoute[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const { user, loading, logout } = useAuth()

  // ✅ Derived directly from the single `pathname`, no second hook call
  const pageTitle = PAGE_TITLES[pathname] ?? "Exa Ranking Lab"

  const handleLogout = async () => {
    try {
      await logout()
      // ✅ User-facing feedback on success — previously nothing visibly
      // happened after a successful logout unless some other mechanism
      // (e.g. an AuthContext-driven route guard) redirected the user;
      // if that mechanism was ever delayed or absent, the user was left
      // on a stale authenticated page with no indication logout worked.
      toast.success("Logged out successfully")
      router.push("/auth")
    } catch (error) {
      // ✅ User-facing feedback on failure — previously only logged to
      // console; the user clicking "Log out" and seeing nothing happen
      // had no way to know it failed.
      console.error("Failed to log out:", error)
      toast.error("Failed to log out. Please try again.")
    }
  }

  const getUserInitials = () => {
    if (!user?.name) return "U"
    return user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  // ✅ Renamed comment to match what this actually does — substring
  // matching, not fuzzy matching (which would tolerate typos/reordering).
  // Not changing the algorithm itself, just the misleading description.
  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    const q = value.toLowerCase()
    const matches = ROUTES.filter(r => r.label.toLowerCase().includes(q))
    setSearchResults(matches)
    setShowDropdown(true)
  }

  const handleResultClick = (href: string) => {
    setShowDropdown(false)
    setSearchQuery("")
    router.push(href)
  }

  if (loading) {
    return (
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-6">
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-6">
      <div className="flex flex-1 items-center justify-between">
        <h1 className="text-xl font-semibold">{pageTitle}</h1>

        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchQuery && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              autoComplete="off"
            />
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto animate-fade-in">
                {searchResults.map((result, idx) => (
                  <button
                    key={result.href + idx}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-100 text-gray-700 text-sm"
                    onMouseDown={() => handleResultClick(result.href)}
                  >
                    {result.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <>
              <Link href="/query-builder">
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Query
                </Button>
              </Link>
<NotificationBell />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-700 font-medium">{getUserInitials()}</span>
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user.name || user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* ✅ Link is now the DIRECT asChild target of
                      DropdownMenuItem, not nested inside an extra <a>.
                      The previous <Link><DropdownMenuItem asChild><a>
                      pattern is fragile across Radix/Next versions and
                      can produce a redundant/duplicate anchor element or
                      hydration mismatches. */}
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">Settings</Link>
                  </DropdownMenuItem>
                  {/* ⚠️ Still points to /settings, same as the item above.
                      Likely meant to deep-link to a specific tab/section
                      (e.g. /settings?tab=api-keys) — left as-is since the
                      intended anchor/query param isn't specified, but
                      flagging that these two items are currently
                      functionally identical. */}
                  <DropdownMenuItem asChild>
                    <Link href="/settings">API Keys</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/auth">
              <Button>Sign In</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}