import type {
  DetectionReason,
  HistoricalBaseline,
  QueryMeta,
  RankingChangeEvidence,
  RankingMovementEvidence,
  ResolvedDetectionThresholds,
} from "./types"
import type { DriftAnalysisResult, DriftTimelinePoint } from "@/types/type"

interface EvidenceInput {
  observedResults: DriftAnalysisResult[]
  affectedResults: DriftAnalysisResult[]
  queryMeta: QueryMeta[]
  thresholds: ResolvedDetectionThresholds
  baseline: HistoricalBaseline
  historicalDeviation: number | null
  baselinePassed: boolean
  windowStartMs: number
  windowEndMs: number
}

function latestPoint(result: DriftAnalysisResult): DriftTimelinePoint | undefined {
  return result.driftTimeline.at(-1)
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

export class EvidenceBuilder {
  static build(input: EvidenceInput): RankingChangeEvidence {
    const {
      observedResults,
      affectedResults,
      queryMeta,
      thresholds,
      baseline,
      historicalDeviation,
      baselinePassed,
      windowStartMs,
      windowEndMs,
    } = input
    const nameByQueryId = new Map(queryMeta.map(query => [query.id, query.name]))
    const affectedPoints = affectedResults
      .map(result => ({ result, point: latestPoint(result) }))
      .filter((item): item is { result: DriftAnalysisResult; point: DriftTimelinePoint } => Boolean(item.point))

    const movements: RankingMovementEvidence[] = affectedPoints.flatMap(({ result, point }) =>
      point.rankChanges.map(change => ({
        queryId: result.queryId,
        queryName: nameByQueryId.get(result.queryId) ?? result.queryName ?? result.queryId,
        url: change.url,
        title: change.title,
        previousPosition: change.previousPosition,
        currentPosition: change.currentPosition,
        positionDelta: change.positionDelta,
      }))
    )
    const absoluteMovements = movements.map(movement => Math.abs(movement.positionDelta))
    const newResultCount = affectedPoints.reduce((sum, { point }) => sum + point.newResults, 0)
    const droppedResultCount = affectedPoints.reduce((sum, { point }) => sum + point.droppedResults, 0)
    const decomposed = affectedPoints
      .map(({ point }) => point.decomposedDrift)
      .filter((value): value is NonNullable<DriftTimelinePoint["decomposedDrift"]> => Boolean(value))

    const gainedDomains = new Set<string>()
    const lostDomains = new Set<string>()
    for (const point of decomposed) {
      for (const url of point.breakdown.newCompetitorUrls) {
        const domain = domainFromUrl(url)
        if (domain) gainedDomains.add(domain)
      }
      for (const url of point.breakdown.droppedUrls) {
        const domain = domainFromUrl(url)
        if (domain) lostDomains.add(domain)
      }
    }

    const timestamps = affectedPoints
      .map(({ point }) => new Date(point.timestamp).getTime())
      .filter(Number.isFinite)
    const timestampSpan = timestamps.length > 1
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0
    const temporalConcentration = Math.max(
      0,
      Math.min(1, 1 - timestampSpan / thresholds.correlationWindowMs)
    )
    const affectedQueryCount = affectedResults.length
    const observedQueryCount = observedResults.length
    const driftRate = observedQueryCount > 0 ? affectedQueryCount / observedQueryCount : 0
    const affectedAverageDrift = affectedQueryCount > 0
      ? affectedResults.reduce((sum, result) => sum + result.latestDrift, 0) / affectedQueryCount
      : 0
    const currentObservedAverageDrift = observedQueryCount > 0
      ? observedResults.reduce((sum, result) => sum + result.latestDrift, 0) / observedQueryCount
      : 0

    const detectionReasons: DetectionReason[] = [
      {
        code: "coordination",
        passed: observedQueryCount >= thresholds.minQueriesInCategory
          && driftRate >= thresholds.driftRateThreshold,
        message: `${affectedQueryCount} of ${observedQueryCount} observed queries drifted (${Math.round(driftRate * 100)}%; threshold ${Math.round(thresholds.driftRateThreshold * 100)}%).`,
      },
      {
        code: "drift_magnitude",
        passed: affectedResults.every(result => result.latestDrift >= thresholds.perQueryDriftThreshold),
        message: `Affected queries met the configured drift-score threshold of ${thresholds.perQueryDriftThreshold}.`,
      },
      {
        code: "correlation_window",
        passed: timestamps.every(timestamp => timestamp >= windowStartMs && timestamp <= windowEndMs),
        message: `Affected observations occurred inside the ${thresholds.correlationWindowMs / 3_600_000}-hour correlation window.`,
      },
      baseline.available
        ? {
            code: "historical_baseline",
            passed: baselinePassed,
            message: baseline.standardDeviation === 0
              ? `Observed-query average drift ${currentObservedAverageDrift.toFixed(1)} was compared with the zero-variance baseline plus the ${thresholds.baselineAbsoluteEpsilon}-point engineering noise floor.`
              : `Current drift was ${historicalDeviation?.toFixed(2) ?? "—"} standard deviations above the historical mean; threshold ${thresholds.baselineDeviationThreshold}.`,
          }
        : {
            code: "baseline_fallback",
            passed: true,
            message: `Fixed thresholds were used because ${baseline.historicalQueryCount} query histories and ${baseline.historicalObservationCount} observations were available; ${thresholds.minBaselineQueries} queries and ${thresholds.minBaselineSamples} observations are required.`,
          },
    ]

    return {
      affectedQueryCount,
      observedQueryCount,
      driftRate,
      configuredDriftRateThreshold: thresholds.driftRateThreshold,
      averageDriftScore: affectedAverageDrift,
      affectedAverageDrift,
      currentObservedAverageDrift,
      correlationWindowMs: thresholds.correlationWindowMs,
      correlationWindowHours: thresholds.correlationWindowMs / 3_600_000,
      temporalConcentration,
      averageAbsoluteRankMovement: average(absoluteMovements),
      newResultCount,
      droppedResultCount,
      urlTurnoverCount: newResultCount + droppedResultCount,
      averageContentDrift: average(decomposed.map(point => point.contentDrift)),
      averageCompetitorDrift: average(decomposed.map(point => point.competitorDrift)),
      averageRerankDrift: average(decomposed.map(point => point.rerankDrift)),
      domainsGained: [...gainedDomains].sort(),
      domainsLost: [...lostDomains].sort(),
      rankingWinners: movements
        .filter(movement => movement.positionDelta > 0)
        .sort((a, b) => b.positionDelta - a.positionDelta)
        .slice(0, 5),
      rankingLosers: movements
        .filter(movement => movement.positionDelta < 0)
        .sort((a, b) => a.positionDelta - b.positionDelta)
        .slice(0, 5),
      historicalBaselineUsed: baseline.available,
      baselineMean: baseline.mean,
      baselineStandardDeviation: baseline.standardDeviation,
      baselineSampleCount: baseline.sampleCount,
      historicalObservationCount: baseline.historicalObservationCount,
      historicalQueryCount: baseline.historicalQueryCount,
      amountAboveBaseline: currentObservedAverageDrift - baseline.mean,
      baselineAbsoluteEpsilon: thresholds.baselineAbsoluteEpsilon,
      historicalDeviation,
      detectionReasons,
    }
  }
}
