// app/services/snapshot-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite/appwrite-server"
import { ID, Query } from "appwrite"
import { createHash } from "crypto"
import type { RankingSnapshot } from "@/types/type"
import { loadFromStorage, saveToStorage, transformSnapshotDocument } from "../../../utils/db-utils"

export class SnapshotService {
  private isLocal: boolean

  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  // ── Content hash ───────────────────────────────────────────────────────────

  /**
   * SHA-256 hash of snapshot content for deduplication.
   *
   *  Results sorted by position before hashing so the same set of URLs
   *    in a different order doesn't produce a false "new" snapshot.
   */
  private generateSnapshotHash(results: any[]): string {
    const sorted = [...results].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    )
    const content = JSON.stringify(
      sorted.map(r => ({ url: r.url, title: r.title,fulltext: r.fullText?.slice(0, 5000) ?? "", snippet: r.snippet, position: r.position }))
    )
    return createHash("sha256").update(content).digest("hex")
  }

  // ── Paginated fetch (UI display) ───────────────────────────────────────────

  async getSnapshotsPaginated(
    queryId?: string,
    userId?:  string,
    page      = 1,
    limit     = 20
  ): Promise<{
    data:       RankingSnapshot[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
  }> {
    if (this.isLocal) {
      const all = loadFromStorage<RankingSnapshot>("snapshots")
      let filtered = all
      if (queryId) filtered = filtered.filter(s => s.queryId === queryId)
      if (userId)  filtered = filtered.filter(s => s.userId  === userId)
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      const total      = filtered.length
      const totalPages = Math.ceil(total / limit)
      const data       = filtered.slice((page - 1) * limit, page * limit)
      return { data, pagination: { page, limit, total, totalPages } }
    }

    // Throws on error — caller (API route) handles it
    const queries = [
      Query.limit(limit),
      Query.offset((page - 1) * limit),
      Query.orderDesc("timestamp"),
    ]
    if (queryId) queries.push(Query.equal("queryId", queryId))
    if (userId)  queries.push(Query.equal("userId",  userId))

    console.log(`[SnapshotService] Paginated fetch: page=${page}, limit=${limit}`)

    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries)
    const total      = response.total
    const totalPages = Math.ceil(total / limit)

    console.log(`[SnapshotService] Paginated: ${response.documents.length}/${total}`)

    return {
      data:       response.documents.map(doc => transformSnapshotDocument(doc, false)),
      pagination: { page, limit, total, totalPages },
    }
  }

  // ── Full dataset fetch (analytics) ────────────────────────────────────────

  /**
   * Fetches up to `limit` snapshots for analytics.
   *
   *    Appwrite max per request is 5000. If a user has more snapshots,
   *     only the most recent `limit` are returned. This is an intentional
   *     cap for performance — analytics engine handles large sets via
   *     deduplication and sampling. Increase limit if needed.
   */
  async getSnapshots(
    queryId?: string,
    userId?:  string,
    limit     = 1000
  ): Promise<RankingSnapshot[]> {
    try {
      if (this.isLocal) {
        const all = loadFromStorage<RankingSnapshot>("snapshots")
        let filtered = all
        if (queryId) filtered = filtered.filter(s => s.queryId === queryId)
        if (userId)  filtered = filtered.filter(s => s.userId  === userId)
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        return filtered
      }

      const queries = [
        Query.limit(limit),
        Query.orderDesc("timestamp"),
      ]
      if (queryId) queries.push(Query.equal("queryId", queryId))
      if (userId)  queries.push(Query.equal("userId",  userId))

      console.log(`[SnapshotService] Analytics fetch: limit=${limit}, userId=${userId ?? "all"}`)

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries)

      if (response.total > limit) {
        console.warn(
          `[SnapshotService] getSnapshots: user ${userId} has ${response.total} snapshots; ` +
          `returning most recent ${limit}. Increase limit if analytics are incomplete.`
        )
      }

      console.log(`[SnapshotService] Analytics: ${response.documents.length} snapshots`)
      return response.documents.map(doc => transformSnapshotDocument(doc, false))
    } catch (err) {
      console.error(`[SnapshotService] getSnapshots failed (userId=${userId}, queryId=${queryId}):`, err)
      return []
    }
  }

  // ── Create with deduplication ──────────────────────────────────────────────

  async createSnapshot(
    snapshot: Omit<RankingSnapshot, "id"> & { userId: string }
  ): Promise<RankingSnapshot> {
    const snapshotHash = this.generateSnapshotHash(snapshot.results)
    const now          = new Date()

    console.log(`[SnapshotService] Creating snapshot for query ${snapshot.queryId}, hash: ${snapshotHash}`)

    // ── Deduplication (remote + local) ────────────────────────────────────
    const DEDUP_WINDOW_MS = 120_000 // 2 minutes

    if (this.isLocal) {
      // ✅ Local dedup — consistent with remote behaviour
      const existing = loadFromStorage<RankingSnapshot>("snapshots")
      const duplicate = existing.find(s => {
        if (s.queryId !== snapshot.queryId || s.userId !== snapshot.userId) return false
        const age = now.getTime() - new Date(s.timestamp).getTime()
        if (age > DEDUP_WINDOW_MS) return false
        return this.generateSnapshotHash(s.results) === snapshotHash
      })
      if (duplicate) {
        console.log(`[SnapshotService] Duplicate detected (local): ${duplicate.id}`)
        return duplicate
      }

      const id: string     = ID.unique()
      const newSnapshot: RankingSnapshot = {
        ...snapshot,
        id,
        metadata: { ...snapshot.metadata, contentHash: snapshotHash },
      }
      existing.push(newSnapshot)
      saveToStorage("snapshots", existing)
      return newSnapshot
    }

    // Remote dedup
    const recent = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SNAPSHOTS,
      [
        Query.equal("queryId", snapshot.queryId),
        Query.equal("userId",  snapshot.userId),
        Query.greaterThan("timestamp", new Date(now.getTime() - DEDUP_WINDOW_MS).toISOString()),
        Query.orderDesc("timestamp"),
        Query.limit(5),
      ]
    )

    for (const doc of recent.documents) {
      const existing = transformSnapshotDocument(doc, false)
      const age      = now.getTime() - new Date(existing.timestamp).getTime()
      if (this.generateSnapshotHash(existing.results) === snapshotHash && age < DEDUP_WINDOW_MS) {
        console.log(`[SnapshotService] Duplicate detected (remote): ${doc.$id}`)
        return existing
      }
    }

    // ── No duplicate — create new ─────────────────────────────────────────
    const id = ID.unique()
    console.log(`[SnapshotService] Creating new snapshot: ${id}`)

    // ✅ Explicit field list — no accidental spread of extra properties
    const doc = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.SNAPSHOTS,
      id,
      {
        queryId:   snapshot.queryId,
        userId:    snapshot.userId,
        timestamp: snapshot.timestamp.toISOString(),
        queryType: snapshot.queryType ?? "unknown",
        results:   JSON.stringify(snapshot.results),
        metadata:  JSON.stringify({
          ...snapshot.metadata,
          contentHash: snapshotHash,
        }),
      }
    )

    console.log(`[SnapshotService] Snapshot created: ${id}`)
    return transformSnapshotDocument(doc, false)
  }

  // ── Single snapshot fetch ──────────────────────────────────────────────────

  async getSnapshot(id: string): Promise<RankingSnapshot | null> {
    try {
      if (this.isLocal) {
        const all = loadFromStorage<RankingSnapshot>("snapshots")
        return all.find(s => s.id === id) ?? null
      }
      const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id)
      return transformSnapshotDocument(doc, false)
    } catch (err) {
      console.error(`[SnapshotService] getSnapshot(${id}) failed:`, err)
      return null
    }
  }
}