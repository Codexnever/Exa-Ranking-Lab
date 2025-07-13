// Utility functions for storage and document transformation
import { CATEGORY_MAP, CATEGORY_MAP_REVERSE } from "@/lib/category-map"
import type { QueryConfig, RankingSnapshot, UserFeedback } from "@/lib/type"

export function getStorageKey(type: string): string {
  return `exa_ranking_lab_${type}`
}

export function loadFromStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const data = localStorage.getItem(getStorageKey(key))
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(data))
  } catch (error) {
    console.error("Failed to save to localStorage:", error)
  }
}

export function transformQueryDocument(doc: any, isLocal: boolean): QueryConfig {
  if (isLocal) return doc
  return {
    id: doc.$id,
    name: doc.name,
    query: doc.query,
    category: CATEGORY_MAP_REVERSE[doc.category] || doc.category,
    filters: JSON.parse(doc.filters || "{}"),
    schedule: JSON.parse(doc.schedule || "{}"),
    tags: JSON.parse(doc.tags || "[]"),
    createdAt: new Date(doc.createdAt),
    lastRun: doc.lastRun ? new Date(doc.lastRun) : undefined,
    userId: doc.userId,
  }
}

export function transformSnapshotDocument(doc: any, isLocal: boolean): RankingSnapshot {
  if (isLocal) return doc
  return {
    id: doc.$id,
    queryId: doc.queryId,
    timestamp: new Date(doc.timestamp),
    results: JSON.parse(doc.results || "[]"),
    metadata: JSON.parse(doc.metadata || "{}"),
    userId: doc.userId,
  }
}

export function transformFeedbackDocument(doc: any, isLocal: boolean): UserFeedback {
  if (isLocal) return doc
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
