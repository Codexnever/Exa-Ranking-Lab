// app/logic/useAvgResponseTimeImprovement.ts

import { useMemo } from "react"

import type { RankingSnapshot } from "@/types/type"

/**
 * Compares average response times between the earliest and latest snapshot
 * periods and returns the measured improvement in milliseconds.
 */
export function useAvgResponseTimeImprovement(
  snapshots: RankingSnapshot[],
  period: number = 5,
) {
  return useMemo(() => {
    // Require enough snapshots to build two independent comparison periods.
    if (
      !Array.isArray(snapshots) ||
      snapshots.length < period * 2
    ) {
      return {
        improvementMs: 0,
        prevAvg: 0,
        currAvg: 0,
      }
    }

    // Sort defensively so period comparisons always follow snapshot time order.
    const getTimestamp = (
      snapshot: RankingSnapshot,
    ): number => {
      const timestamp = new Date(
        snapshot.timestamp,
      ).getTime()

      return Number.isNaN(timestamp)
        ? 0
        : timestamp
    }

    const sortedSnapshots = [...snapshots].sort(
      (a, b) =>
        getTimestamp(a) - getTimestamp(b),
    )

    const previousPeriod = sortedSnapshots.slice(
      0,
      period,
    )

    const currentPeriod = sortedSnapshots.slice(
      -period,
    )

    // Only include real response-time measurements in the average.
    const calculateAverage = (
      periodSnapshots: RankingSnapshot[],
    ): number => {
      const validSnapshots =
        periodSnapshots.filter(
          (
            snapshot,
          ): snapshot is RankingSnapshot & {
            metadata: {
              responseTime: number
            }
          } =>
            typeof snapshot?.metadata
              ?.responseTime === "number" &&
            snapshot.metadata.responseTime > 0,
        )

      if (validSnapshots.length === 0) {
        return 0
      }

      const totalResponseTime =
        validSnapshots.reduce(
          (sum, snapshot) =>
            sum +
            snapshot.metadata.responseTime,
          0,
        )

      return (
        totalResponseTime /
        validSnapshots.length
      )
    }

    const prevAvg =
      calculateAverage(previousPeriod)

    const currAvg =
      calculateAverage(currentPeriod)

    // Skip the comparison when either period has no valid measurements.
    if (prevAvg === 0 || currAvg === 0) {
      return {
        improvementMs: 0,
        prevAvg,
        currAvg,
      }
    }

    const improvementMs =
      prevAvg - currAvg

    return {
      improvementMs,
      prevAvg,
      currAvg,
    }
  }, [snapshots, period])
}