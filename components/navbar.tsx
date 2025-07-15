"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
import { useAuth } from "@/lib/contexts/auth-context"

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const { user, loading } = useAuth()

 
  const handleLogout = async () => {
    try {
    await logout()
      window.location.href = "/auth" // force redirect after logout
    } catch (error) {
      console.error("Failed to log out:", error)
    }
  }

  const getPageTitle = () => {
    switch (pathname) {
      case "/": return "Dashboard"
      case "/query-builder": return "Query Builder"
      case "/snapshots": return "Snapshots"
      case "/compare": return "Compare Rankings"
      case "/feedback": return "Feedback"
      case "/settings": return "Settings"
      default: return "Exa Ranking Lab"
    }
  }

  const getUserInitials = () => {
    if (!user?.name) return "U"
    return user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  }

  // Define all searchable routes and queries (can be extended)
  const routes = [
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

  // Search logic: fuzzy match against routes
  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    const q = value.toLowerCase()
    const routeMatches = routes.filter(r => r.label.toLowerCase().includes(q))
    setSearchResults([...routeMatches])
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
          <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-6">
      <div className="flex flex-1 items-center justify-between">
        <h1 className="text-xl font-semibold">{getPageTitle()}</h1>

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
                  <Link href="/profile" passHref>
                    <DropdownMenuItem asChild>
                      <a className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Profile
                      </a>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings" passHref>
                    <DropdownMenuItem asChild>
                      <a>Settings</a>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings" passHref>
                    <DropdownMenuItem asChild>
                      <a>API Keys</a>
                    </DropdownMenuItem>
                  </Link>
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

async function logout() {
await fetch("/api/logout", { method: "POST", credentials: "include" })
}

