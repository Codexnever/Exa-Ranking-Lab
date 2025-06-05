import { databases, DATABASE_ID, COLLECTIONS } from "@/lib/appwrite"
import { ID, Query } from "appwrite"
import type { QueryConfig, RankingSnapshot, UserFeedback, AnalyticsData } from "@/lib/types"

class DatabaseService {
  private isLocal: boolean

  constructor() {
    // Use local storage in development if Appwrite is not configured
    this.isLocal = false
    console.log(`DatabaseService initialized in ${this.isLocal ? 'local' : 'production'} mode`)
  }

  // Local storage helper methods
  private getStorageKey(type: string): string {
    return `exa_ranking_lab_${type}`
  }

  private loadFromStorage<T>(key: string): T[] {
    if (typeof window === "undefined") return []
    try {
      const data = localStorage.getItem(this.getStorageKey(key))
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  private saveToStorage<T>(key: string, data: T[]): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(data))
    } catch (error) {
      console.error("Failed to save to localStorage:", error)
    }
  }

  // Query operations
  async createQuery(query: Omit<QueryConfig, "id" | "createdAt">): Promise<QueryConfig> {
      try {
        // Only generate uniqueId for local mode
        if (this.isLocal) {
          const uniqueId = ID.unique();
          const newQuery: QueryConfig = {
            ...query,
            id: uniqueId,
            createdAt: new Date(),
          };
          const queries = this.loadFromStorage<QueryConfig>("queries");
          queries.push(newQuery);
          this.saveToStorage("queries", queries);
          return newQuery;
        }
        // Generate a new unique ID for each attempt
        const uniqueId = ID.unique();
        const document = await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.QUERIES,
          uniqueId,
          {
            ...query,
            status: (query as any).status || 'active',
            filters: JSON.stringify(query.filters || {}),
            schedule: JSON.stringify(query.schedule || { enabled: false, frequency: "daily" }),
            tags: JSON.stringify(query.tags || []),
            createdAt: new Date().toISOString(),
          }
        );
        return this.transformQueryDocument(document);
      } catch (error: any) {
        // Improved error logging for unique constraint violations
        if (error?.code === 409) {
          // Log the entire error object for debugging
          console.error("Appwrite 409 error full object:", error);
          if (error?.message) {
            throw new Error(`Failed to create query: ${error.message}`);
          }
        }
        console.error("Failed to create query:", error);
        throw new Error("Failed to create query");
      }
    
    throw new Error("Failed to create query after multiple attempts");
  }

  async getQueries(userId?: string): Promise<QueryConfig[]> {
    try {
      if (this.isLocal) {
        const queries = this.loadFromStorage<QueryConfig>("queries")
        return queries.filter((q) => !userId || q.userId === userId)
      }

      if (!userId) {
        console.error("No userId provided")
        return []
      }

      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.QUERIES, [
        Query.equal("userId", userId)
      ])
console.log('Database Service.ts {response}:-',response)
      return response.documents.map((doc) => this.transformQueryDocument(doc))
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
        const queries = this.loadFromStorage<QueryConfig>("queries")
        return queries.find((q) => q.id === id) || null
      }

      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return this.transformQueryDocument(document)
    } catch (error) {
      console.error("Failed to fetch query:", error)
      return null
    }
  }

  async updateQuery(id: string, updates: Partial<QueryConfig>): Promise<QueryConfig | null> {
    try {
      if (this.isLocal) {
        const queries = this.loadFromStorage<QueryConfig>("queries")
        const index = queries.findIndex((q) => q.id === id)
        if (index === -1) return null
        queries[index] = { ...queries[index], ...updates }
        this.saveToStorage("queries", queries)
        return queries[index]
      }

      const updateData: any = { ...updates }
      if (updates.filters) updateData.filters = JSON.stringify(updates.filters)
      if (updates.schedule) updateData.schedule = JSON.stringify(updates.schedule)
      if (updates.tags) updateData.tags = JSON.stringify(updates.tags)
      if (updates.lastRun) updateData.lastRun = updates.lastRun.toISOString()

      const document = await databases.updateDocument(DATABASE_ID, COLLECTIONS.QUERIES, id, updateData)
      return this.transformQueryDocument(document)
    } catch (error) {
      console.error("Failed to update query:", error)
      return null
    }
  }

  async deleteQuery(id: string): Promise<boolean> {
    try {
      if (this.isLocal) {
        const queries = this.loadFromStorage<QueryConfig>("queries")
        const filteredQueries = queries.filter((q) => q.id !== id)
        if (filteredQueries.length === queries.length) return false
        this.saveToStorage("queries", filteredQueries)
        return true
      }

      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.QUERIES, id)
      return true
    } catch (error) {
      console.error("Failed to delete query:", error)
      return false
    }
  }

  // Snapshot operations
  async createSnapshot(snapshot: Omit<RankingSnapshot, "id"> & { userId: string }): Promise<RankingSnapshot> {
    try {
      const id = ID.unique()

      if (this.isLocal) {
        const newSnapshot: RankingSnapshot = { ...snapshot, id }
        const snapshots = this.loadFromStorage<RankingSnapshot>("snapshots")
        snapshots.push(newSnapshot)
        this.saveToStorage("snapshots", snapshots)
        return newSnapshot
      }

      const document = await databases.createDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id, {
        ...snapshot,
        timestamp: snapshot.timestamp.toISOString(),
        results: JSON.stringify(snapshot.results),
        metadata: JSON.stringify(snapshot.metadata),
        userId: snapshot.userId,
      })
      console.log('TheDetailOfSnapshot:-',document)
      return this.transformSnapshotDocument(document)
    } catch (error) {
      console.error("Failed to create snapshot:", error)
      throw new Error("Failed to create snapshot")
    }
  }

  async getSnapshots(queryId?: string, userId?: string): Promise<RankingSnapshot[]> {
    try {
      if (this.isLocal) {
        const snapshots = this.loadFromStorage<RankingSnapshot>("snapshots")
        let filtered = snapshots
        if (queryId) filtered = filtered.filter((s) => s.queryId === queryId)
        if (userId) filtered = filtered.filter((s) => s.userId === userId)
        return filtered
      }

      const queries = []
      if (queryId) queries.push(Query.equal("queryId", queryId))
      if (userId) queries.push(Query.equal("userId", userId))
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries)
      return response.documents.map((doc) => this.transformSnapshotDocument(doc))
    } catch (error) {
      console.error("Failed to fetch snapshots:", error)
      return []
    }
  }

  async getSnapshot(id: string): Promise<RankingSnapshot | null> {
    try {
      if (this.isLocal) {
        const snapshots = this.loadFromStorage<RankingSnapshot>("snapshots")
        return snapshots.find((s) => s.id === id) || null
      }

      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.SNAPSHOTS, id)
      console.log('getting snapshot',document)
      return this.transformSnapshotDocument(document)
    } catch (error) {
      console.error("Failed to fetch snapshot:", error)
      return null
    }
  }

  // Feedback operations
  async createFeedback(feedback: Omit<UserFeedback, "id" | "createdAt">): Promise<UserFeedback> {
    try {
      const id =ID.unique()

      if (this.isLocal) {
        const newFeedback: UserFeedback = {
          ...feedback,
          id,
          createdAt: new Date(),
        }
        const feedbacks = this.loadFromStorage<UserFeedback>("feedback")
        feedbacks.push(newFeedback)
        this.saveToStorage("feedback", feedbacks)
        return newFeedback
      }

      const document = await databases.createDocument(DATABASE_ID, COLLECTIONS.FEEDBACK, id, {
        ...feedback,
        tags: JSON.stringify(feedback.tags || []),
        createdAt: new Date().toISOString(),
      })

      return this.transformFeedbackDocument(document)
    } catch (error) {
      console.error("Failed to create feedback:", error)
      throw new Error("Failed to create feedback")
    }
  }

  async getFeedback(queryId?: string): Promise<UserFeedback[]> {
    try {
      if (this.isLocal) {
        const feedback = this.loadFromStorage<UserFeedback>("feedback")
        return queryId ? feedback.filter((f) => f.queryId === queryId) : feedback
      }

      const queries = queryId ? [Query.equal("queryId", queryId)] : []
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.FEEDBACK, queries)
      return response.documents.map((doc) => this.transformFeedbackDocument(doc))
    } catch (error) {
      console.error("Failed to fetch feedback:", error)
      return []
    }
  }

  // Analytics operations
  async getAnalytics(userId?: string): Promise<AnalyticsData> {
  try {
    let snapshots: RankingSnapshot[];

    if (this.isLocal) {
      snapshots = this.loadFromStorage<RankingSnapshot>("snapshots");
      if (userId) snapshots = snapshots.filter((s) => s.userId === userId);
    } else {
      const queries = userId ? [Query.equal("userId", userId)] : [];
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SNAPSHOTS, queries);
      console.log('getanalyticsbest log chaking',queries)//get empty
      // Safely transform and filter out null/undefined
      snapshots = response.documents
        .map((doc) => {
          try {
            return this.transformSnapshotDocument(doc);
          } catch (err) {
            console.warn("Invalid snapshot document skipped:", doc);
            return null;
          }
        })
        .filter((snap): snap is RankingSnapshot => snap !== null);
    }

    if (!snapshots || snapshots.length === 0) {
      return {
        rankingStability: 0,
        volatilityIndex: 0,
        domainDiversity: 0,
        avgResponseTime: 0,
        newContentDiscovery: 0,
        querySuccessRate: 0,
      };
    }

    // Filter out only snapshots with missing userId or missing metadata.responseTime
    // snapshots = snapshots.filter(snap => snap.userId && snap.metadata && typeof snap.metadata.responseTime === "number")
    // if (snapshots.length === 0) {
    //   return {
    //     rankingStability: 0,
    //     volatilityIndex: 0,
    //     domainDiversity: 0,
    //     avgResponseTime: 0,
    //     newContentDiscovery: 0,
    //     querySuccessRate: 0,
    //   };
    // }

    const snapshotsByQuery: Record<string, RankingSnapshot[]> = {};
    const seenUrls = new Set<string>();
    let totalResponseTime = 0;
    let successCount = 0;
    const domainSet = new Set<string>();

    for (const snap of snapshots) {
      if (!snap.queryId) continue;

      if (!snap.results || !Array.isArray(snap.results)) {
        console.warn("Skipping snapshot with invalid results:", snap);
        continue;
      }

      if (!snap.metadata || typeof snap.metadata.responseTime !== "number") {
        console.warn("Skipping snapshot with invalid metadata:", snap);
        continue;
      }

      // Grouping
      if (!snapshotsByQuery[snap.queryId]) {
        snapshotsByQuery[snap.queryId] = [];
      }
      snapshotsByQuery[snap.queryId].push(snap);

      // Response Time
      totalResponseTime += snap.metadata.responseTime;

      // Success Check
      if (snap.results.length > 0) successCount++;

      // Domain Diversity & Seen URLs
      for (const result of snap.results) {
        try {
          const domain = new URL(result.url).hostname;
          domainSet.add(domain);
          seenUrls.add(result.url);
        } catch (e) {
          console.warn("Invalid URL in result:", result.url);
        }
      }
    }

    const avgResponseTime = totalResponseTime / snapshots.length;
    const querySuccessRate = (successCount / snapshots.length) * 100;

    // === RANKING STABILITY & VOLATILITY ===
    let totalRankChanges = 0;
    let totalComparisons = 0;

    Object.values(snapshotsByQuery).forEach((snaps) => {
      snaps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      for (let i = 1; i < snaps.length; i++) {
        const prev = snaps[i - 1].results?.map((r) => r.url) || [];
        const curr = snaps[i].results?.map((r) => r.url) || [];

        const maxLength = Math.max(prev.length, curr.length);
        for (let j = 0; j < maxLength; j++) {
          const prevUrl = prev[j] || null;
          const currUrl = curr[j] || null;

          if (prevUrl && currUrl) {
            if (prevUrl !== currUrl) totalRankChanges++;
          } else {
            totalRankChanges++;
          }
          totalComparisons++;
        }
      }
    });

    const stabilityScore =
      totalComparisons > 0 ? 100 - (totalRankChanges / totalComparisons) * 100 : 100;
    const volatilityIndex =
      totalComparisons > 0 ? (totalRankChanges / totalComparisons) * 10 : 0;

    const averageNewContentPerSnapshot = seenUrls.size / snapshots.length;

    return {
      rankingStability: parseFloat(stabilityScore.toFixed(2)),
      volatilityIndex: parseFloat(volatilityIndex.toFixed(2)),
      domainDiversity: domainSet.size,
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      newContentDiscovery: parseFloat(averageNewContentPerSnapshot.toFixed(2)),
      querySuccessRate: parseFloat(querySuccessRate.toFixed(2)),
    };
  } catch (error) {
    console.error("Failed to calculate analytics:", error);
    return {
      rankingStability: 0,
      volatilityIndex: 0,
      domainDiversity: 0,
      avgResponseTime: 0,
      newContentDiscovery: 0,
      querySuccessRate: 0,
    };
  }
}


  // Access log operations
  async logAccess(userId: string, action: string, details: Record<string, any>): Promise<void> {
    try {
      if (this.isLocal) {
        const logs = this.loadFromStorage<any>("access_logs")
        logs.push({
          userId,
          action,
          details,
          timestamp: new Date(),
          ipAddress: "",
          userAgent: ""
        })
        this.saveToStorage("access_logs", logs)
        return
      }

      await databases.createDocument(DATABASE_ID, COLLECTIONS.ACCESS_LOGS, ID.unique(), {
        userId,
        action,
        details: JSON.stringify(details),
        timestamp: new Date().toISOString(),
        ipAddress: "", // Would be populated from request
        userAgent: "", // Would be populated from request
      })
    } catch (error) {
      console.error("Failed to log access:", error)
    }
  }

  // Helper methods to transform documents
  private transformQueryDocument(doc: any): QueryConfig {
    if (this.isLocal) return doc

    return {
      id: doc.$id,
      name: doc.name,
      query: doc.query,
      category: doc.category,
      filters: JSON.parse(doc.filters || "{}"),
      schedule: JSON.parse(doc.schedule || "{}"),
      tags: JSON.parse(doc.tags || "[]"),
      createdAt: new Date(doc.createdAt),
      lastRun: doc.lastRun ? new Date(doc.lastRun) : undefined,
      userId: doc.userId,
    }
  }

  private transformSnapshotDocument(doc: any): RankingSnapshot {
    if (this.isLocal) return doc

    return {
      id: doc.$id,
      queryId: doc.queryId,
      timestamp: new Date(doc.timestamp),
      results: JSON.parse(doc.results || "[]"),
      metadata: JSON.parse(doc.metadata || "{}"),
      userId: doc.userId,
    }
  }

  private transformFeedbackDocument(doc: any): UserFeedback {
    if (this.isLocal) return doc

    return {
      id: doc.$id,
      queryId: doc.queryId,
      resultUrl: doc.resultUrl,
      snapshotId: doc.snapshotId,
      feedbackType: doc.feedbackType,
      rating: doc.rating,
      comment: doc.comment,
      expectedPosition: doc.expectedPosition,
      tags: JSON.parse(doc.tags || "[]"),
      userId: doc.userId,
      createdAt: new Date(doc.createdAt),
    }
  }
}

export const databaseService = new DatabaseService()
