"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart2,
  Search,
  Camera,
  GitCompare,
  MessageSquare,
  Settings,
  ChevronDown,
  ChevronRight,
  Activity,
  Database,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"

export default function Sidebar() {
  const pathname = usePathname()
  const [queriesOpen, setQueriesOpen] = useState(true)

  const routes = [
    {
      label: "Dashboard",
      icon: BarChart2,
      href: "/",
    },
    {
      label: "Query Builder",
      icon: Search,
      href: "/query-builder",
    },
    {
      label: "Query Monitor",
      icon: Activity,
      href: "/query-monitor",
    },
    {
      label: "Analytics",
      icon: Activity,
      href: "/analytics",
    },
    {
      label: "Snapshots",
      icon: Camera,
      href: "/snapshots",
    },
    {
      label: "Compare Rankings",
      icon: GitCompare,
      href: "/compare",
    },
    {
      label: "Feedback",
      icon: MessageSquare,
      href: "/feedback",
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/settings",
    },
  ]

  const savedQueries = [
    { name: "React Ecosystem", count: 12, category: "web" },
    { name: "AI/ML Research", count: 8, category: "research" },
    { name: "Frontend Frameworks", count: 15, category: "code" },
    { name: "Performance Optimization", count: 6, category: "web" },
  ]

  return (
    <div className="flex flex-col w-64 border-r bg-white">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold">E</span>
          </div>
          <div>
            <span className="font-bold text-xl text-gray-900">Exa Ranking Lab</span>
            <div className="text-xs text-gray-500">v1.0.0</div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === route.href
                  ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                  : "text-gray-700 hover:bg-gray-50",
              )}
            >
              <route.icon className="h-4 w-4" />
              {route.label}
            </Link>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          <div className="px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Saved Queries</div>
          <Collapsible open={queriesOpen} onOpenChange={setQueriesOpen} className="space-y-1">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-3 py-2 text-sm font-medium text-gray-700">
                <div className="flex items-center gap-3">
                  <Database className="h-4 w-4" />
                  <span>Query Collections</span>
                </div>
                {queriesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1">
              {savedQueries.map((collection) => (
                <Button
                  key={collection.name}
                  variant="ghost"
                  className="w-full justify-between pl-10 text-sm font-normal text-gray-600 hover:text-gray-900"
                >
                  <span>{collection.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {collection.count}
                  </Badge>
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-700 font-medium text-sm">JS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">John Smith</p>
            <p className="text-xs text-gray-500 truncate">Developer</p>
          </div>
        </div>
      </div>
    </div>
  )
}
