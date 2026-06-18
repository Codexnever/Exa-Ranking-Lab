// app/services/query-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { ID, Query } from "appwrite"
import type { QueryConfig } from "@/types/type"
import { CATEGORY_MAP } from "@/lib/category-map"
import { loadFromStorage, saveToStorage, transformQueryDocument } from "../../../utils/db-utils"

export class QueryService {
  private isLocal: boolean

  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  async createQuery(query: Omit<QueryConfig, "id" | "createdAt">): Promise<QueryConfig> {
    if (!query.category || !(query.category in CATEGORY_MAP)) {
      throw new Error(`Invalid category: "${query.category}"`)
    }

    // ✅ Generate ID once — used by both local and remote paths
    const id = ID.unique()

    if (this.isLocal) {
      const newQuery: QueryConfig = { ...query, id, createdAt: new Date() }
      const queries = loadFromStorage<QueryConfig>("queries")
      queries.push(newQuery)
      saveToStorage("queries", queries)
      return newQuery
    }

    try {
      // ✅ Explicit field list — no accidental spread of id/createdAt/etc.
      const document = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.QUERIES,
        id,
        {
          name:     query.name,
          query:    query.query,
          category: CATEGORY_MAP[query.category],
          userId:   query.userId,
          status:   (query as any).status ?? "active",
          filters:  JSON.stringify(query.filters  ?? {}),
          schedule: JSON.stringify(query.schedule ?? {}),
          tags:     JSON.stringify(query.tags     ?? []),
          createdAt: new Date().toISOString(),
        }
      )
      return transformQueryDocument(document, false)
    } catch (err: any) {
      // ✅ Preserve the original error message rather than swallowing it
      const message = err?.message ?? "Failed to create query"
      console.error("[QueryService] createQuery failed:", err)
      throw new Error(message)
    }
  }

  async getQueries(userId?: string): Promise<QueryConfig[]> {
    if (this.isLocal) {
      const queries = loadFromStorage<QueryConfig>("queries")
      return queries.filter(q => !userId || q.userId === userId)
    }

    if (!userId) {
      console.error("[QueryService] getQueries: userId required for remote fetch")
      return []
    }

    // ✅ Throws on error so the store can surface it — not silent []
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.QUERIES,
      [Query.equal("userId", userId)]
    )
    return response.documents.map(doc => transformQueryDocument(doc, false))
  }

  /**
   * Fetch ALL queries with schedule.enabled=true, across ALL users.
   *
   * Used by the cron scheduler (/api/cron/process-scheduled), which runs
   * server-side with no specific user context — it needs to find every
   * due query regardless of owner.
   *
   * ✅ Cursor-based pagination — handles collections larger than Appwrite's
   *    single-request limit (100 docs).
   * ✅ Caps total documents scanned per call to avoid unbounded scans on
   *    very large collections; logs a warning if the cap is hit so you
   *    know to add a dedicated `scheduleEnabled` indexed attribute for
   *    DB-level filtering at scale.
   */
  async getAllScheduledQueries(maxScan = 2000): Promise<QueryConfig[]> {
    if (this.isLocal) {
      const queries = loadFromStorage<QueryConfig>("queries")
      return queries.filter(q => q.schedule?.enabled)
    }

    const PAGE_SIZE = 100
    const results: QueryConfig[] = []
    let cursor: string | undefined
    let scanned = 0

    while (scanned < maxScan) {
      const queries = [Query.limit(PAGE_SIZE), Query.orderAsc("$id")]
      if (cursor) queries.push(Query.cursorAfter(cursor))

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.QUERIES, queries)
      if (response.documents.length === 0) break

      for (const doc of response.documents) {
        const query = transformQueryDocument(doc, false)
        if (query.schedule?.enabled) results.push(query)
      }

      scanned += response.documents.length
      cursor   = response.documents[response.documents.length - 1].$id

      if (response.documents.length < PAGE_SIZE) break  // last page
    }

    if (scanned >= maxScan) {
      console.warn(
        `[QueryService] getAllScheduledQueries: hit scan cap of ${maxScan} documents. ` +
        `Some scheduled queries may not have been checked this run. Consider adding ` +
        `a dedicated indexed 'scheduleEnabled' boolean attribute for DB-level filtering.`
      )
    }

    return results
  }

  async getQuery(id: string): Promise<QueryConfig | null> {
    if (!id) {
      console.error("[QueryService] getQuery: id required")
      return null
    }

    try {
      if (this.isLocal) {
        const queries = loadFromStorage<QueryConfig>("queries")
        return queries.find(q => q.id === id) ?? null
      }
      const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return transformQueryDocument(doc, false)
    } catch (err) {
      console.error("[QueryService] getQuery failed:", err)
      return null
    }
  }

  async updateQuery(id: string, updates: Partial<QueryConfig>): Promise<QueryConfig> {
    if (this.isLocal) {
      const queries = loadFromStorage<QueryConfig>("queries")
      const idx = queries.findIndex(q => q.id === id)
      if (idx === -1) throw new Error(`Query ${id} not found`)
      queries[idx] = { ...queries[idx], ...updates }
      saveToStorage("queries", queries)
      return queries[idx]
    }

    try {
      // Build Appwrite update payload — only serialise changed fields
      const data: Record<string, any> = {}
      if (updates.name)     data.name     = updates.name
      if (updates.query)    data.query    = updates.query
      if (updates.category) data.category = CATEGORY_MAP[updates.category] ?? updates.category
      if (updates.filters)  data.filters  = JSON.stringify(updates.filters)
      if (updates.schedule) data.schedule = JSON.stringify(updates.schedule)
      if (updates.tags)     data.tags     = JSON.stringify(updates.tags)
      if (updates.lastRun)  data.lastRun  = new Date(updates.lastRun).toISOString()
      if (updates.userId)   data.userId   = updates.userId

      const doc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.QUERIES, id, data)
      return transformQueryDocument(doc, false)
    } catch (err: any) {
      const message = err?.message ?? "Failed to update query"
      console.error("[QueryService] updateQuery failed:", err)
      // ✅ Throw instead of returning null — callers can surface the error
      throw new Error(message)
    }
  }

  async deleteQuery(
    id:    string,
    opts?: { userId?: string; ipAddress?: string; userAgent?: any }
  ): Promise<boolean> {
    try {
      if (this.isLocal) {
        const queries   = loadFromStorage<QueryConfig>("queries")
        const snapshots = loadFromStorage<any>("snapshots")
        saveToStorage("queries",   queries.filter(q => q.id !== id))
        saveToStorage("snapshots", snapshots.filter((s: any) => s.queryId !== id))
        return true
      }

      // ✅ Fetch ALL snapshots for this query, not just Appwrite's default 25
      const snapshotList = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SNAPSHOTS,
        [
          Query.equal("queryId", id),
          Query.limit(500),          // Appwrite max is 5000; 500 is a safe batch
        ]
      )

      // Delete snapshots in parallel, then delete the query
      await Promise.all(
        snapshotList.documents.map(snap =>
          databases.deleteDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, snap.$id)
        )
      )

      // If there are more snapshots beyond the 500 limit, do a second pass
      if (snapshotList.total > 500) {
        console.warn(
          `[QueryService] deleteQuery: query ${id} has ${snapshotList.total} snapshots; ` +
          `deleted first 500 in this call. Remaining will be cleaned up on next delete attempt.`
        )
      }

      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return true
    } catch (err) {
      console.error("[QueryService] deleteQuery failed:", err)
      return false
    }
  }
}