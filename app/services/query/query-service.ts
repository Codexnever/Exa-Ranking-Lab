// app/services/database/query-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
// ✅ FIX 1: was `import { ID, Query } from "appwrite"` (browser SDK)
// This is a server-side service called from API routes — must use node-appwrite.
// Using the browser SDK on the server causes subtle issues with ID.unique()
// and Query class behaviour between SDK versions.
import { ID, Query } from "node-appwrite"
import type { QueryConfig } from "@/types/type"
import { CATEGORY_MAP } from "@/constants/category-map"
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

    const id = ID.unique()

    if (this.isLocal) {
      const newQuery: QueryConfig = { ...query, id, createdAt: new Date() }
      const queries = loadFromStorage<QueryConfig>("queries")
      queries.push(newQuery)
      saveToStorage("queries", queries)
      return newQuery
    }

    try {
      const document = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.QUERIES,
        id,
        {
          name:      query.name,
          query:     query.query,
          // ✅ Stores raw category key ("news") — consistent with how
          // getQuery reads it back and how createQuery validates it
          category:  query.category,
          userId:    query.userId,
          status:    (query as any).status ?? "active",
          filters:   JSON.stringify(query.filters  ?? {}),
          schedule:  JSON.stringify(query.schedule ?? {}),
          tags:      JSON.stringify(query.tags     ?? []),
          createdAt: new Date().toISOString(),
        }
      )
      return transformQueryDocument(document, false)
    } catch (err: any) {
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

    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.QUERIES,
      [Query.equal("userId", userId)]
    )
    return response.documents.map(doc => transformQueryDocument(doc, false))
  }

  /**
   * Fetch ALL queries with schedule.enabled=true, across ALL users.
   * Used by the cron scheduler — cursor-paginated to handle large collections.
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
      const queryFilters = [Query.limit(PAGE_SIZE), Query.orderAsc("$id")]
      if (cursor) queryFilters.push(Query.cursorAfter(cursor))

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.QUERIES, queryFilters)
      if (response.documents.length === 0) break

      for (const doc of response.documents) {
        const query = transformQueryDocument(doc, false)
        if (query.schedule?.enabled) results.push(query)
      }

      scanned += response.documents.length
      cursor   = response.documents[response.documents.length - 1].$id

      if (response.documents.length < PAGE_SIZE) break
    }

    if (scanned >= maxScan) {
      console.warn(
        `[QueryService] getAllScheduledQueries: hit scan cap of ${maxScan} documents. ` +
        `Consider adding an indexed 'scheduleEnabled' boolean attribute for DB-level filtering.`
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
      const data: Record<string, any> = {}
      if (updates.name)     data.name     = updates.name
      if (updates.query)    data.query    = updates.query
      if (updates.category) {
        // ✅ FIX 2: was `CATEGORY_MAP[updates.category] ?? updates.category`
        // which mapped "news" → "News" (the display label), inconsistent with
        // createQuery which stores the raw key "news" directly.
        // This caused: create stores "news", update stores "News", then
        // getQuery returns "News", which fails the `in CATEGORY_MAP` check
        // on the next operation because "News" is the VALUE not the KEY.
        // Fix: store the raw category key, same as createQuery does.
        if (!(updates.category in CATEGORY_MAP)) {
          throw new Error(`Invalid category: "${updates.category}"`)
        }
        data.category = updates.category
      }
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

      // ✅ FIX 3: loop until ALL snapshots are deleted before removing
      // the query document. Previous version deleted the query even when
      // >500 snapshots remained, orphaning them permanently in Appwrite
      // since the query document no longer exists for a "next attempt".
      let totalDeleted = 0
      while (true) {
        const snapshotList = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.SNAPSHOTS,
          [
            Query.equal("queryId", id),
            Query.limit(500),
          ]
        )

        if (snapshotList.documents.length === 0) break

        await Promise.all(
          snapshotList.documents.map(snap =>
            databases.deleteDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, snap.$id)
          )
        )

        totalDeleted += snapshotList.documents.length

        // If fewer than 500 returned, we've reached the last page
        if (snapshotList.documents.length < 500) break
      }

      if (totalDeleted > 0) {
        console.log(`[QueryService] deleteQuery: removed ${totalDeleted} snapshots for query ${id}`)
      }

      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return true
    } catch (err) {
      console.error("[QueryService] deleteQuery failed:", err)
      return false
    }
  }
}