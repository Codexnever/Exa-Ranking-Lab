// QueryService handles all query-related operations
import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite"
import { ID, Query } from "appwrite"
import type { QueryConfig } from "@/lib/types"
import { CATEGORY_MAP } from "@/lib/category-map"
import { loadFromStorage, saveToStorage, transformQueryDocument } from "./db-utils"

export class QueryService {
  private isLocal: boolean
  constructor(isLocal: boolean) {
    this.isLocal = isLocal
  }

  async createQuery(query: Omit<QueryConfig, "id" | "createdAt">): Promise<QueryConfig> {
    try {
      if (!query.category || !(query.category in CATEGORY_MAP)) {
        throw new Error(`Invalid or missing category. Received: ${query.category}`)
      }
      if (this.isLocal) {
        const uniqueId = ID.unique();
        const newQuery: QueryConfig = {
          ...query,
          id: uniqueId,
          createdAt: new Date(),
        };
        const queries = loadFromStorage<QueryConfig>("queries");
        queries.push(newQuery);
        saveToStorage("queries", queries);
        return newQuery;
      }
      const uniqueId = ID.unique();
      const document = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.QUERIES,
        uniqueId,
        {
          ...query,
          category: CATEGORY_MAP[query.category],
          status: (query as any).status || 'active',
          filters: JSON.stringify(query.filters || {}),
          schedule: JSON.stringify(query.schedule),
          tags: JSON.stringify(query.tags || []),
          createdAt: new Date().toISOString(),
        }
      );
      return transformQueryDocument(document, this.isLocal);
    } catch (error: any) {
      if (error?.code === 409) {
        console.error("Appwrite 409 error full object:", error);
        if (error?.message) {
          throw new Error(`Failed to create query: ${error.message}`);
        }
      }
      console.error("Failed to create query:", error);
      throw new Error("Failed to create query");
    }
  }

  async getQueries(userId?: string): Promise<QueryConfig[]> {
    try {
      if (this.isLocal) {
        const queries = loadFromStorage<QueryConfig>("queries")
        return queries.filter((q) => !userId || q.userId === userId)
      }
      if (!userId) {
        console.error("No userId provided")
        return []
      }
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.QUERIES, [
        Query.equal("userId", userId)
      ])
      return response.documents.map((doc) => transformQueryDocument(doc, this.isLocal))
    } catch (error) {
      console.error("Failed to fetch queries:", error)
      return []
    }
  }

  async getQuery(id: string): Promise<QueryConfig | null> {
    try {
      if (!id) {
        console.error("No query ID provided")
        return null
      }
      if (this.isLocal) {
        const queries = loadFromStorage<QueryConfig>("queries")
        return queries.find((q) => q.id === id) || null
      }
      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return transformQueryDocument(document, this.isLocal)
    } catch (error) {
      console.error("Failed to fetch query:", error)
      return null
    }
  }

  async updateQuery(id: string, updates: Partial<QueryConfig>): Promise<QueryConfig | null> {
    try {
      if (this.isLocal) {
        const queries = loadFromStorage<QueryConfig>("queries")
        const index = queries.findIndex((q) => q.id === id)
        if (index === -1) return null
        queries[index] = { ...queries[index], ...updates }
        saveToStorage("queries", queries)
        return queries[index]
      }
      const updateData: any = { ...updates }
      if (updates.category) updateData.category = CATEGORY_MAP[updates.category] || updates.category
      if (updates.filters) updateData.filters = JSON.stringify(updates.filters)
      if (updates.schedule) updateData.schedule = JSON.stringify(updates.schedule)
      if (updates.tags) updateData.tags = JSON.stringify(updates.tags)
      if (updates.lastRun) updateData.lastRun = updates.lastRun.toISOString()
      const document = await databases.updateDocument(DATABASE_ID, COLLECTIONS.QUERIES, id, updateData)
      return transformQueryDocument(document, this.isLocal)
    } catch (error) {
      console.error("Failed to update query:", error)
      return null
    }
  }

  async deleteQuery(id: string, opts?: { userId?: string, ipAddress?: string, userAgent?: any }): Promise<boolean> {
    try {
      if (this.isLocal) {
        const queries = loadFromStorage<QueryConfig>("queries")
        const filteredQueries = queries.filter((q) => q.id !== id)
        saveToStorage("queries", filteredQueries)
        const snapshots = loadFromStorage<any>("snapshots")
        const filteredSnapshots = snapshots.filter((s: any) => s.queryId !== id)
        saveToStorage("snapshots", filteredSnapshots)
        // Access log handled in main service
        return true
      }
      const snapshotList = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SNAPSHOTS,
        [Query.equal("queryId", id)]
      )
      await Promise.all(
        snapshotList.documents.map((snap) =>
          databases.deleteDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, snap.$id)
        )
      )
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      // Access log handled in main service
      return true
    } catch (error) {
      console.error("❌ Failed to delete query:", error)
      return false
    }
  }
}
