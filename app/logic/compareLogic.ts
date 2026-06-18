// app/logic/compareLogic.ts
// Pure calculation functions — no React imports, fully testable in isolation.
// Components wrap these in useMemo themselves as needed.

import { useMemo } from "react"
import type { RankingChange, RankingSnapshot } from "@/types/type"

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Filter snapshots by query ID.
 * Returns all snapshots when selectedQuery is empty.
 */
export function filterSnapshotsByQuery(
  snapshots:     RankingSnapshot[],
  selectedQuery: string
): RankingSnapshot[] {
  if (!selectedQuery) return snapshots
  return snapshots.filter(s => s.queryId === selectedQuery)
}

/**
 * Calculate ranking changes between two snapshots.
 *
 * Position semantics: lower number = better rank (1 is best).
 *   result1.position=3, result2.position=1 → moved_up (improved)
 *   result1.position=1, result2.position=3 → moved_down (worsened)
 *
 * Note: snapshot1/snapshot2 are looked up in the full snapshots array
 * (not the filtered set) so you can compare any two snapshots regardless
 * of the current query filter.
 */
export function calculateComparison(
  snapshots:  RankingSnapshot[],
  snapshotId1: string,
  snapshotId2: string
): RankingChange[] {
  if (!snapshotId1 || !snapshotId2) return []

  const snap1 = snapshots.find(s => s.id === snapshotId1)
  const snap2 = snapshots.find(s => s.id === snapshotId2)
  if (!snap1 || !snap2) return []

  const urlMap1 = new Map(snap1.results.map(r => [r.url, r]))
  const urlMap2 = new Map(snap2.results.map(r => [r.url, r]))
  const allUrls = new Set([...urlMap1.keys(), ...urlMap2.keys()])

  const changes: RankingChange[] = []

  for (const url of allUrls) {
    const r1 = urlMap1.get(url)
    const r2 = urlMap2.get(url)

    if (r1 && r2) {
      // Present in both snapshots
      const delta = r1.position - r2.position
      let change: RankingChange["change"] = "stable"
      if (delta > 0) change = "moved_up"
      else if (delta < 0) change = "moved_down"

      changes.push({
        url,
        title:            r2.title,
        previousPosition: r1.position,
        currentPosition:  r2.position,
        change,
        changeValue:      Math.abs(delta),
      })
    } else if (r2) {
      // New in snapshot2 — changeValue is its debut position
      changes.push({
        url,
        title:           r2.title,
        currentPosition: r2.position,
        change:          "new",
        // ✅ Debut position, not 0 — shows where it first appeared
        changeValue:     r2.position,
      })
    } else if (r1) {
      // Dropped from snapshot2 — changeValue is its last known position
      changes.push({
        url,
        title:            r1.title,
        previousPosition: r1.position,
        change:           "dropped",
        // ✅ Last known position, not 0 — shows where it was before dropping
        changeValue:      r1.position,
      })
    }
  }

  // Sort by most relevant position: current first, then previous, then Infinity
  // ✅ Use Infinity instead of magic 999 — sorts dropped/new after positioned results
  // ✅ Use nullish coalescing (not ||) — position 0 is falsy but valid
  changes.sort((a, b) => {
    const posA = a.currentPosition ?? a.previousPosition ?? Infinity
    const posB = b.currentPosition ?? b.previousPosition ?? Infinity
    return posA - posB
  })

  return changes
}

// ─── Hook wrapper ─────────────────────────────────────────────────────────────
// Thin React wrapper for components that need memoisation.
// Pure logic above is still directly importable for non-React contexts.

export function useCompareLogic(
  snapshots:     RankingSnapshot[],
  selectedQuery: string,
  snapshot1:     string,
  snapshot2:     string
) {
  const filteredSnapshots = useMemo(
    () => filterSnapshotsByQuery(snapshots, selectedQuery),
    [snapshots, selectedQuery]
  )

  const comparison = useMemo(
    () => calculateComparison(snapshots, snapshot1, snapshot2),
    [snapshots, snapshot1, snapshot2]
  )

  return { filteredSnapshots, comparison }
}