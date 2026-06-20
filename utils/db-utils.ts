// app/services/db-utils.ts
// Utility functions for localStorage and Appwrite document transformation.

import { CATEGORY_MAP_REVERSE } from "@/constants/category-map"
import type { QueryConfig, RankingSnapshot, UserFeedback } from "@/types/type"

// ─── Storage key ──────────────────────────────────────────────────────────────

export function getStorageKey(type: string): string {
  return `exa_ranking_lab_${type}`
}

// ─── Safe JSON parse ──────────────────────────────────────────────────────────
/**
 * Safely parse a field that may already be an object/array (Appwrite sometimes
 * auto-deserialises JSON fields) or a JSON string.
 * Returns `fallback` on any error.
 */
function safeParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  // Already the right type — return as-is
  if (typeof value !== "string") return value as unknown as T
  try {
    return JSON.parse(value) as T
  } catch {
    console.warn("[db-utils] safeParse failed for value:", value)
    return fallback
  }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function loadFromStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(getStorageKey(key))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Save array to localStorage with a size guard to avoid quota errors.
 * Silently skips the save if the serialised payload exceeds 4.5 MB.
 */
export function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return

  try {
    const serialised = JSON.stringify(data)

    // ✅ Size guard — localStorage quota is ~5 MB per origin
    const sizeKB = new Blob([serialised]).size / 1024
    if (sizeKB > 4500) {
      console.warn(
        `[db-utils] saveToStorage: skipping "${key}" — payload too large (${sizeKB.toFixed(0)} KB)`
      )
      return
    }

    localStorage.setItem(getStorageKey(key), serialised)
  } catch (err) {
    console.error("[db-utils] saveToStorage failed:", err)
  }
}

// ─── Document transformers ────────────────────────────────────────────────────

export function transformQueryDocument(doc: any, isLocal: boolean): QueryConfig {
  if (isLocal) return doc as QueryConfig

  // ✅ Validate required field
  if (!doc.$id) {
    console.warn("[db-utils] transformQueryDocument: missing $id", doc)
  }

  return {
    id:        doc.$id       ?? "",
    name:      doc.name      ?? "",
    query:     doc.query     ?? "",
    // ✅ Reverse-map category enum safely
    category:  CATEGORY_MAP_REVERSE[doc.category] ?? doc.category ?? "unknown",
    // ✅ safeParse guards against double-parsed fields
    filters:   safeParse<Record<string, any>>(doc.filters,  {}),
    schedule:  safeParse<Record<string, any>>(doc.schedule, {}),
    tags:      safeParse<string[]>(doc.tags, []),
    createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    lastRun:   doc.lastRun   ? new Date(doc.lastRun)   : undefined,
    userId:    doc.userId    ?? "",
  }
}

export function transformSnapshotDocument(doc: any, isLocal: boolean): RankingSnapshot {
  if (isLocal) return doc as RankingSnapshot

  // ✅ Validate required fields
  if (!doc.$id)     console.warn("[db-utils] transformSnapshotDocument: missing $id",     doc)
  if (!doc.queryId) console.warn("[db-utils] transformSnapshotDocument: missing queryId", doc)

  return {
    id:        doc.$id       ?? "",
    queryId:   doc.queryId   ?? "",
    userId:    doc.userId    ?? "",
    // ✅ safeParse handles both string and pre-parsed array/object
    results:   safeParse<RankingSnapshot["results"]>(doc.results,   []),
    metadata:  safeParse<RankingSnapshot["metadata"]>(doc.metadata, {
      totalResults: 0,
      responseTime: 0,
      executedAt:   new Date().toISOString(),
      source:       "appwrite",
    }),
    timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date(),
    // ✅ queryType was missing in original
    queryType: doc.queryType ?? doc.category ?? "unknown",
  }
}

export function transformFeedbackDocument(doc: any, isLocal: boolean): UserFeedback {
  if (isLocal) return doc as UserFeedback

  if (!doc.$id) {
    console.warn("[db-utils] transformFeedbackDocument: missing $id", doc)
  }

  return {
    id:               doc.$id             ?? "",
    queryId:          doc.queryId         ?? "",
    resultUrl:        doc.resultUrl       ?? "",
    snapshotId:       doc.snapshotId      ?? "",
    feedbackType:     doc.feedbackType    ?? "neutral",
    rating:           doc.rating          ?? 0,
    comment:          doc.comment         ?? "",
    expectedPosition: doc.expectedPosition ?? 0,
    tags:             safeParse<string[]>(doc.tags, []),
    userId:           doc.userId          ?? "",
    createdAt:        doc.createdAt ? new Date(doc.createdAt) : new Date(),
  }
}