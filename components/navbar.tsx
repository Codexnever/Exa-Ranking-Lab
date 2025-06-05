"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, ChevronDown, Plus, Search, User, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")

  const { user, loading, logout } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/auth')
    } catch (error) {
      // Error is already handled by the auth context
    }
  }

  // Get page title based on pathname
  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard"
    if (pathname === "/query-builder") return "Query Builder"
    if (pathname === "/snapshots") return "Snapshots"
    if (pathname === "/compare") return "Compare Rankings"
    if (pathname === "/feedback") return "Feedback"
    if (pathname === "/settings") return "Settings"
    return "Exa Ranking Lab"
  }

  const getUserInitials = () => {
    if (!user?.name) return "U"
    return user.name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
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
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {user ? (
            <>
              <Link href="/query-builder">
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Query
                </Button>
              </Link>

              <Button variant="ghost" size="icon" className="rounded-full">
                <Bell className="h-5 w-5" />
                <span className="sr-only">Notifications</span>
              </Button>

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
                  <DropdownMenuItem onClick={() => router.push('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/settings')}>Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/api-keys')}>API Keys</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button onClick={() => router.push('/auth')}>Sign In</Button>
          )}
        </div>
      </div>
    </header>
  )
}
