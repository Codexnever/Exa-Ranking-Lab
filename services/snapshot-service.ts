// SnapshotService handles all snapshot-related operations
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite"
import { ID, Query } from "appwrite"
import type { RankingSnapshot } from "@/lib/types"
import { loadFromStorage, saveToStorage, transformSnapshotDocument } from "./db-utils"

export class SnapshotService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
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

  async getSnapshots(queryId?: string, userId?: string): Promise<RankingSnapshot[]> {
    try {
      if (this.isLocal) {
        const snapshots = loadFromStorage<RankingSnapshot>("snapshots")
        let filtered = snapshots
        if (queryId) filtered = filtered.filter((s) => s.queryId === queryId)
        if (userId) filtered = filtered.filter((s) => s.userId === userId)
        return filtered
      }
      const queries = []
      if (queryId) queries.push(Query.equal("queryId", queryId))
      if (userId) queries.push(Query.equal("userId", userId))
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries)
      return response.documents.map((doc) => transformSnapshotDocument(doc, this.isLocal))
    } catch (error) {
      console.error("Failed to fetch snapshots:", error)
      return []
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
