import type { AlgorithmUpdateEvent } from "./types"

export class DescriptionBuilder {
  static summary(event: AlgorithmUpdateEvent): string {
    const pct = Math.round(event.metrics.driftRate * 100)
    const severity = this.titleCase(event.severity)
    return `${severity} possible ranking change in "${event.category}" — ${event.affectedQueries.length} queries affected (${pct}% drift rate)`
  }

  static detail(event: AlgorithmUpdateEvent): string {
    const { metrics } = event
    let historical = ""
    if (metrics.historicalStdDev > 0) {
      const deviations = (metrics.avgDriftScore - metrics.historicalAvgDrift) / metrics.historicalStdDev
      historical = ` This is ${deviations.toFixed(1)}σ above the historical average drift of ${metrics.historicalAvgDrift.toFixed(1)} for this category.`
    }
    return `${this.titleCase(event.severity)} possible ranking change detected in the "${event.category}" category with ${event.confidence.score}% confidence. ${event.affectedQueries.length} of ${metrics.totalQueriesInCategory} observed queries (${Math.round(metrics.driftRate * 100)}%) drifted inside the correlation window with an average score of ${metrics.avgDriftScore.toFixed(1)}.${historical} This is an externally observed search-behavior change, not confirmation of an internal algorithm deployment.`
  }

  static label(event: AlgorithmUpdateEvent): string {
    return `${event.category}:${event.severity}:conf${event.confidence.score}`
  }

  private static titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
}
