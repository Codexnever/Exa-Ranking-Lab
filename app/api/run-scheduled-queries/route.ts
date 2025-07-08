// File: app/api/run-scheduled-queries/route.ts

import { NextResponse } from "next/server"
import { QueryService } from "@/services/query-service"
import { QueryConfig } from "@/lib/types"

// instantiate QueryService in non-local (Appwrite) mode
const queryService = new QueryService(false)

// Helper to check if the query should run based on lastRun and frequency
function shouldRunQuery(query: QueryConfig): boolean {
  if (!query.schedule.enabled) return false
console.log("Checking if query should run:", query.id)
  const now = new Date()
  const lastRun = query.lastRun ? new Date(query.lastRun) : null
  const freq = query.schedule.frequency

  if (!lastRun) return true // never run before

  const diffInMs = now.getTime() - lastRun.getTime()

  switch (freq) {
    case "hourly":
      return diffInMs >= 60 * 60 * 1000 // 1 hour
    case "daily":
      return diffInMs >= 24 * 60 * 60 * 1000 // 1 day
    case "weekly":
      return diffInMs >= 7 * 24 * 60 * 60 * 1000 // 1 week
    default:
      return false
  }
}

export async function GET() {
  try {
    // Fetch all queries (optionally you could filter by enabled only)
    const allQueries = await queryService.getQueries()

    // Only run scheduled + due queries
    const dueQueries = allQueries.filter((q) =>
      q.schedule?.enabled && shouldRunQuery(q)
    )

    const results: { id: string; status: "success" | "error"; error?: string }[] = []

    for (const query of dueQueries) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL}/api/queries/${query.id}/run`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query)
          }
        )

        if (!res.ok) {
          const error = await res.text()
          throw new Error(error)
        }

        // update lastRun
        await queryService.updateQuery(query.id, { lastRun: new Date() })

        results.push({ id: query.id, status: "success" })
      } catch (err: any) {
        results.push({ id: query.id, status: "error", error: err.message })
      }
    }

    return NextResponse.json({ ran: results.length, results })
  } catch (error) {
    return NextResponse.json({ error: "Failed to run scheduled queries" }, { status: 500 })
  }
}
