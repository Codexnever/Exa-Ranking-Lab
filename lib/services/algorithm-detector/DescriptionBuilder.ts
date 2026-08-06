import type { AlgorithmUpdateEvent } from "./types"

export class DescriptionBuilder {
  static summary(event: AlgorithmUpdateEvent): string {
    const pct = Math.round(event.metrics.driftRate * 100)
    const severity = this.titleCase(event.severity)
    return `${severity} algorithm update in "${event.category}" — ${event.affectedQueries.length} queries affected (${pct}% drift rate)`
  }

  static detail(event: AlgorithmUpdateEvent): string {
    const { metrics } = event
    let historical = ""
    if (metrics.historicalStdDev > 0) {
      const deviations = (metrics.avgDriftScore - metrics.historicalAvgDrift) / metrics.historicalStdDev
      historical = ` This is ${deviations.toFixed(1)}σ above the historical average drift of ${metrics.historicalAvgDrift.toFixed(1)} for this category.`
    }
    return `${this.titleCase(event.severity)} algorithm update detected in the "${event.category}" category with ${event.confidence.score}% confidence. ${event.affectedQueries.length} of ${metrics.totalQueriesInCategory} queries (${Math.round(metrics.driftRate * 100)}%) drifted simultaneously with an average score of ${metrics.avgDriftScore.toFixed(1)}.${historical} This pattern is consistent with a search engine algorithm change rather than random individual query drift.`
  }

  static label(event: AlgorithmUpdateEvent): string {
    return `${event.category}:${event.severity}:conf${event.confidence.score}`
  }

  private static titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
}
