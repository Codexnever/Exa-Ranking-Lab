import { useMemo } from "react"
import type { RankingChange, RankingSnapshot } from "@/lib/type"

export function useCompareLogic(snapshots: RankingSnapshot[], selectedQuery: string, snapshot1: string, snapshot2: string) {
  const filteredSnapshots = useMemo(() => snapshots.filter((s) => !selectedQuery || s.queryId === selectedQuery), [snapshots, selectedQuery])

  const comparison = useMemo(() => {
    if (!snapshot1 || !snapshot2) return []
    const snap1 = snapshots.find((s) => s.id === snapshot1)
    const snap2 = snapshots.find((s) => s.id === snapshot2)
    if (!snap1 || !snap2) return []
    const changes: RankingChange[] = []
    const urlMap1 = new Map(snap1.results.map((r) => [r.url, r]))
    const urlMap2 = new Map(snap2.results.map((r) => [r.url, r]))
    const allUrls = new Set([...urlMap1.keys(), ...urlMap2.keys()])
    allUrls.forEach((url) => {
      const result1 = urlMap1.get(url)
      const result2 = urlMap2.get(url)
      if (result1 && result2) {
        const positionChange = result1.position - result2.position
        let change: RankingChange["change"] = "stable"
        if (positionChange > 0) change = "moved_up"
        else if (positionChange < 0) change = "moved_down"
        changes.push({
          url,
          title: result2.title,
          previousPosition: result1.position,
          currentPosition: result2.position,
          change,
          changeValue: Math.abs(positionChange),
        })
      } else if (result2) {
        changes.push({
          url,
          title: result2.title,
          currentPosition: result2.position,
          change: "new",
          changeValue: 0,
        })
      } else if (result1) {
        changes.push({
          url,
          title: result1.title,
          previousPosition: result1.position,
          change: "dropped",
          changeValue: 0,
        })
      }
    })
    changes.sort((a, b) => {
      const posA = a.currentPosition || a.previousPosition || 999
      const posB = b.currentPosition || b.previousPosition || 999
      return posA - posB
    })
    return changes
  }, [snapshots, snapshot1, snapshot2])

  return { filteredSnapshots, comparison }
}
