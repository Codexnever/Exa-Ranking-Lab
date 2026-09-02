import type { AlgorithmUpdateEvent } from "./types"

export class DescriptionBuilder {
  static summary(event: AlgorithmUpdateEvent): string {
    const pct = Math.round(event.metrics.driftRate * 100)
    const severity = this.titleCase(event.severity)
    const label = event.detectionMode === "baseline-aware"
      ? "baseline-supported ranking movement"
      : "unverified fixed-threshold candidate"
    return `${severity} ${label} in "${event.category}" — ${event.affectedQueries.length} queries affected (${pct}% drift rate)`
  }

  static detail(event: AlgorithmUpdateEvent): string {
    const { metrics } = event
    let historical = ""
    if (event.evidence.historicalBaselineUsed) {
      historical = event.evidence.historicalComparisonMethod === "robust-mad"
        ? ` This is ${event.evidence.historicalDeviation?.toFixed(1) ?? "—"} robust deviations above the historical category-window median of ${event.evidence.baselineMedian.toFixed(1)}.`
        : ` This met the historical median plus the ${event.thresholds.baselineAbsoluteEpsilon}-point absolute engineering noise floor.`
    }
    const candidate = event.detectionMode === "baseline-aware"
      ? "baseline-supported coordinated ranking-change candidate"
      : "unverified fixed-threshold ranking-change candidate"
    return `${this.titleCase(event.severity)} ${candidate} in the "${event.category}" category with an evidence score of ${event.confidence.score}%. ${event.affectedQueries.length} of ${metrics.totalQueriesInCategory} observed queries (${Math.round(metrics.driftRate * 100)}%) drifted inside the correlation window; affected-query average ${metrics.affectedAverageDrift.toFixed(1)}, all-observed-query average ${metrics.currentObservedAverageDrift.toFixed(1)}.${historical} This is an externally observed search-behavior change, not confirmation of an internal algorithm deployment.`
  }

  static label(event: AlgorithmUpdateEvent): string {
    return `${event.category}:${event.severity}:conf${event.confidence.score}`
  }

  private static titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
}
