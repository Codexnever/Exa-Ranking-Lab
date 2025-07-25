// app/services/snapshot-service.ts
import { databases, DATABASE_ID, COLLECTIONS } from "@/app/server/appwrite"
import { ID, Query } from "appwrite"
import type { RankingSnapshot } from "@/lib/type"
import { loadFromStorage, saveToStorage, transformSnapshotDocument } from "./db-utils"

export class SnapshotService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  // New: Paginated fetch method for UI display
  async getSnapshotsPaginated(
    queryId?: string, 
    userId?: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<{
    data: RankingSnapshot[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }> {
    try {
      if (this.isLocal) {
        const snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        let filtered = snapshots
        if (queryId) filtered = filtered.filter((s) => s.queryId === queryId)
        if (userId) filtered = filtered.filter((s) => s.userId === userId)
        
        // Sort by timestamp (newest first)
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        
        const total = filtered.length
        const totalPages = Math.ceil(total / limit)
        const offset = (page - 1) * limit
        const data = filtered.slice(offset, offset + limit)
        
        return {
          data,
          pagination: { page, limit, total, totalPages }
        }
      }

      // Build Appwrite queries with pagination
      const queries = [
        Query.limit(limit),
        Query.offset((page - 1) * limit),
        Query.orderDesc('timestamp')
      ]
      
      if (queryId) queries.push(Query.equal("queryId", queryId))
      if (userId) queries.push(Query.equal("userId", userId))

      console.log(`[SnapshotService] Fetching paginated: page=${page}, limit=${limit}`)

      // Get paginated results
      const response = await databases.listDocuments(
        DATABASE_ID, 
        COLLECTIONS.SNAPSHOTS, 
        queries
      )

      // Get total count (Appwrite provides this in the response)
      const total = response.total
      const totalPages = Math.ceil(total / limit)
      
      console.log(`[SnapshotService] Paginated result: ${response.documents.length}/${total} snapshots`)
      
      return {
        data: response.documents.map((doc) => transformSnapshotDocument(doc, this.isLocal)),
        pagination: { page, limit, total, totalPages }
      }
    } catch (error) {
      console.error("Failed to fetch paginated snapshots:", error)
      throw new Error("Failed to fetch paginated snapshots")
    }
  }

  // Updated: Original method for analytics (higher limit, no pagination)
  async getSnapshots(queryId?: string, userId?: string, limit: number = 1000): Promise<RankingSnapshot[]> {
    try {
      if (this.isLocal) {
        const snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        let filtered = snapshots
        if (queryId) filtered = filtered.filter((s) => s.queryId === queryId)
        if (userId) filtered = filtered.filter((s) => s.userId === userId)
        
        // Sort by timestamp (newest first)
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        
        return filtered
      }

      const queries = [
        Query.limit(limit),
        Query.orderDesc('timestamp')
      ]
      
      if (queryId) queries.push(Query.equal("queryId", queryId))
      if (userId) queries.push(Query.equal("userId", userId))

      console.log(`[SnapshotService] Fetching all snapshots with limit: ${limit}`)

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries)
      
      console.log(`[SnapshotService] All snapshots result: ${response.documents.length} snapshots`)
      
      return response.documents.map((doc) => transformSnapshotDocument(doc, this.isLocal))
    } catch (error) {
      console.error("Failed to fetch snapshots:", error)
      return []
    }
  }

  async createSnapshot(snapshot: Omit<RankingSnapshot, "id"> & { userId: string }): Promise<RankingSnapshot> {
    try {
      const id = ID.unique()
      if (this.isLocal) {
        const newSnapshot: RankingSnapshot = { ...snapshot, id }
        const snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        snapshots.push(newSnapshot)
        saveToStorage("snapshots", snapshots)
        return newSnapshot
      }
      
      const document = await databases.createDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id, {
        ...snapshot,
        timestamp: snapshot.timestamp.toISOString(),
        results: JSON.stringify(snapshot.results),
        metadata: JSON.stringify(snapshot.metadata),
        userId: snapshot.userId,
      })
      
      return transformSnapshotDocument(document, this.isLocal)
    } catch (error) {
      console.error("Failed to create snapshot:", error)
      throw new Error("Failed to create snapshot")
    }
  }

  async getSnapshot(id: string): Promise<RankingSnapshot | null> {
    try {
      if (this.isLocal) {
        const snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        return snapshots.find((s) => s.id === id) || null
      }
      
      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id)
      return transformSnapshotDocument(document, this.isLocal)
    } catch (error) {
      console.error("Failed to fetch snapshot:", error)
      return null
    }
  }
}
