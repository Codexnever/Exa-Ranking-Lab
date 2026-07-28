import { useMemo } from "react"
import type { RankingSnapshot } from "@/types/type"

/**
 * Calculates the average response time improvement between the first and
 * last periods.
 * @param snapshots Array of RankingSnapshot (sorted internally by timestamp)
 * @param period Number of valid snapshots to average for each period (default: 5)
 * @returns { improvementMs: number, prevAvg: number, currAvg: number }
 */
export function useAvgResponseTimeImprovement(
  snapshots: RankingSnapshot[],
  period: number = 5
) {
  return useMemo(() => {
    //  Array.isArray guard — `!snapshots` alone doesn't catch a
    // non-array truthy value crossing a store/API boundary at runtime,
    // even though TypeScript's compile-time type says it can't happen.
    // Same defense-in-depth pattern applied across every other
    // component/hook touched in this audit.
    if (!Array.isArray(snapshots) || snapshots.length < period * 2) {
      return { improvementMs: 0, prevAvg: 0, currAvg: 0 }
    }

    //  Defensive sort — `new Date(timestamp).getTime()` on a malformed
    // timestamp yields NaN, which produces undefined/inconsistent sort
    // ordering (not a crash, but a silent correctness bug: "first N vs
    // last N" could end up comparing the wrong periods). Invalid entries
    // are pushed to a stable position rather than left to NaN comparison
    // semantics.
    const getTime = (s: RankingSnapshot) => {
      const t = new Date(s.timestamp).getTime()
      return isNaN(t) ? 0 : t
    }
    const sorted = [...snapshots].sort((a, b) => getTime(a) - getTime(b))

    const prev = sorted.slice(0, period)
    const curr = sorted.slice(-period)

    //  FIX: exclude snapshots with missing/zero responseTime from the
    // average instead of defaulting them to 0 and including them in the
    // denominator. The old `s.metadata?.responseTime || 0` defaulted
    // missing values to 0 and then averaged that 0 in alongside real
    // readings — e.g. real times [200, 210, 195, 0, 0] averaged to 121ms
    // instead of the true ~202ms average of the 3 valid readings.
    //
    // This matters specifically for an "improvement" metric: if older
    // snapshots happen to have more missing responseTime entries (e.g.
    // ones created before the Exa searchTime fix was deployed) than
    // newer ones, the old logic would show a FALSE "improvement" that's
    // actually just better data completeness over time, not genuinely
    // faster queries. Filtering keeps the comparison honest — it's only
    // ever comparing real measured response times against other real
    // measured response times.
    const avg = (arr: RankingSnapshot[]): number => {
      const valid = arr.filter(
        (s): s is RankingSnapshot & { metadata: { responseTime: number } } =>
          typeof s?.metadata?.responseTime === "number" && s.metadata.responseTime > 0
      )
      if (valid.length === 0) return 0
      return valid.reduce((sum, s) => sum + s.metadata.responseTime, 0) / valid.length
    }

    const prevAvg = avg(prev)
    const currAvg = avg(curr)

    // If either period had no valid readings at all, there's nothing
    // meaningful to compare — avoid reporting a misleading "improvement"
    // derived from one all-zero side.
    if (prevAvg === 0 || currAvg === 0) {
      return { improvementMs: 0, prevAvg, currAvg }
    }

    const improvementMs = prevAvg - currAvg
    return { improvementMs, prevAvg, currAvg }
  }, [snapshots, period])
}