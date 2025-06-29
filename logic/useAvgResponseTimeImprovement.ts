import { useMemo } from "react"
import type { RankingSnapshot } from "@/lib/types"

/**
 * Calculates the average response time improvement between the first and last periods.
 * @param snapshots Array of RankingSnapshot (should be sorted by timestamp ascending)
 * @param period Number of snapshots to average for each period (default: 5)
 * @returns { improvementMs: number, prevAvg: number, currAvg: number }
 */
export function useAvgResponseTimeImprovement(snapshots: RankingSnapshot[], period: number = 5) {
  return useMemo(() => {
    if (!snapshots || snapshots.length < period * 2) {
      return { improvementMs: 0, prevAvg: 0, currAvg: 0 }
    }
    // Sort snapshots by timestamp ascending
    const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const prev = sorted.slice(0, period)
    const curr = sorted.slice(-period)
    const avg = (arr: typeof curr) => arr.reduce((sum, s) => sum + (s.metadata?.responseTime || 0), 0) / arr.length
    const prevAvg = avg(prev)
    const currAvg = avg(curr)
    const improvementMs = prevAvg - currAvg
    return { improvementMs, prevAvg, currAvg }
  }, [snapshots, period])
}
