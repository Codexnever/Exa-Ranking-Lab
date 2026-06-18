// Domain Analysis Logic for Analytics Page
// Computes domain authority, ranking distribution, and content diversity from snapshots
import { useMemo } from "react"
import type { RankingSnapshot, SearchResult } from "@/types/type"

export interface DomainStats {
  domain: string
  count: number
  avgPosition: number
  bestPosition: number
  worstPosition: number
  contentTypes: Record<string, number>
}

export function useDomainAnalysis(snapshots: RankingSnapshot[]) {
  // Aggregate domain stats from all snapshots
  return useMemo(() => {
    const domainMap = new Map<string, DomainStats>()
    snapshots.forEach((snapshot) => {
      snapshot.results.forEach((result: SearchResult) => {
        const domain = result.domain || "unknown"
        const stats = domainMap.get(domain) || {
          domain,
          count: 0,
          avgPosition: 0,
          bestPosition: Number.POSITIVE_INFINITY,
          worstPosition: Number.NEGATIVE_INFINITY,
          contentTypes: {},
        }
        stats.count++
        stats.avgPosition += result.position
        stats.bestPosition = Math.min(stats.bestPosition, result.position)
        stats.worstPosition = Math.max(stats.worstPosition, result.position)
        stats.contentTypes[result.contentType] = (stats.contentTypes[result.contentType] || 0) + 1
        domainMap.set(domain, stats)
      })
    })
    // Finalize average position
    domainMap.forEach((stats) => {
      stats.avgPosition = stats.count > 0 ? stats.avgPosition / stats.count : 0
    })
    // Sort by count descending
    return Array.from(domainMap.values()).sort((a, b) => b.count - a.count)
  }, [snapshots])
}
