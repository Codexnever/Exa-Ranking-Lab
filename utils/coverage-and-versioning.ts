// lib/utils/coverage-and-versioning.ts
//
// Two small but high-value utilities:
//
//   1. computeConfigHash()   — SHA-256 of query parameters that affect results.
//      Store alongside each snapshot. If consecutive snapshots have different
//      configHashes, drift analysis flags a "parameter change" warning instead
//      of reporting artificial drift from changed numResults/category/etc.
//
//   2. computeCoverageGap()  — tracks numRequested vs numReturned from Exa.
//      A widening gap over time signals topic coverage decay in Exa's index.
//      Stored in snapshot.metadata and surfaced in the Analytics page.
//
// INTEGRATION:
//   In run/route.ts (and process-scheduled/route.ts), add these two fields
//   to the snapshot metadata before calling createSnapshot():
//
//     metadata: {
//       responseTime:  data.searchTime,
//       numRequested:  query.filters.numResults,
//       numReturned:   mappedResults.length,
//       coverageGap:   computeCoverageGap(query.filters.numResults, mappedResults.length),
//       configHash:    computeConfigHash(query),
//     }

import { createHash } from "crypto"
import type { QueryConfig } from "@/types/type"

// ─── Config Versioning ───────────────────────────────────────────────────────

/**
 * Produces a stable SHA-256 fingerprint of all query parameters that
 * affect what Exa returns. If this hash changes between two consecutive
 * snapshots, drift analysis should warn that the comparison may be
 * contaminated by parameter changes rather than genuine SERP drift.
 *
 * Parameters included:
 *   - numResults    (more results = more positions to shift = higher drift)
 *   - category      (different category = completely different index)
 *   - includeDomains (domain allowlist changes the result pool)
 *   - excludeDomains (domain blocklist changes the result pool)
 *   - startDate / endDate (date filters change the eligible set)
 *
 * Parameters NOT included (don't affect Exa results):
 *   - name, tags, schedule settings (metadata only)
 */
export function computeConfigHash(query: QueryConfig): string {
  const canonical = JSON.stringify({
    numResults:     query.filters?.numResults ?? 50,
    category:       query.category ?? "",
    includeDomains: [...(query.filters?.includeDomains ?? [])].sort(),
    excludeDomains: [...(query.filters?.excludeDomains ?? [])].sort(),
    startDate:      query.filters?.startDate ?? null,
    endDate:        query.filters?.endDate   ?? null,
  })

  return createHash("sha256").update(canonical).digest("hex").slice(0, 16)
  // 16 hex chars (64 bits) is sufficient for config versioning —
  // collision probability is negligible for this use case
}

// ─── Coverage Gap ────────────────────────────────────────────────────────────

export interface CoverageGapMetric {
  numRequested: number
  numReturned:  number
  gap:          number   // numRequested - numReturned (always >= 0)
  gapRate:      number   // gap / numRequested (0.0 – 1.0)
  status:       "full" | "partial" | "sparse"
}

/**
 * Computes the result coverage gap for a single snapshot.
 *
 * Status interpretation:
 *   full    — Exa returned ≥90% of requested results (normal)
 *   partial — 50–89% returned (query is niche or date-filtered)
 *   sparse  — <50% returned (topic very niche, or coverage decay)
 *
 * Trend over time: if `gapRate` increases across snapshots for the same
 * query, Exa's index has fewer qualifying results for this topic over time.
 * Surface this in Analytics as a "coverage trend" chart.
 */
export function computeCoverageGap(
  numRequested: number,
  numReturned:  number
): CoverageGapMetric {
  const safeRequested = Math.max(1, numRequested)
  const safeReturned  = Math.max(0, Math.min(numReturned, safeRequested))
  const gap     = safeRequested - safeReturned
  const gapRate = gap / safeRequested

  let status: CoverageGapMetric["status"]
  if (gapRate < 0.10)      status = "full"
  else if (gapRate < 0.50) status = "partial"
  else                     status = "sparse"

  return { numRequested: safeRequested, numReturned: safeReturned, gap, gapRate, status }
}

/**
 * Detects if a sequence of coverage metrics shows a worsening trend.
 * Used to surface "coverage decay" warnings in the UI.
 *
 * Returns:
 *   trend: "worsening" if gapRate is consistently increasing
 *          "improving" if gapRate is consistently decreasing
 *          "stable"    otherwise
 */
export function analyzeCoverageTrend(
  metrics: CoverageGapMetric[]
): { trend: "worsening" | "improving" | "stable"; changeRate: number } {
  if (metrics.length < 2) return { trend: "stable", changeRate: 0 }

  const rates = metrics.map(m => m.gapRate)
  const n     = rates.length
  const first = rates.slice(0, Math.floor(n / 2))
  const last  = rates.slice(Math.floor(n / 2))

  const firstAvg = first.reduce((s, v) => s + v, 0) / first.length
  const lastAvg  = last.reduce((s, v) => s + v, 0)  / last.length
  const change   = lastAvg - firstAvg

  // >5% change in gap rate = meaningful trend
  if (change > 0.05)       return { trend: "worsening", changeRate: change }
  if (change < -0.05)      return { trend: "improving", changeRate: change }
  return { trend: "stable", changeRate: change }
}

// ─── Drift contamination check ───────────────────────────────────────────────

/**
 * Compares two consecutive snapshots' configHashes.
 * Returns a warning if the query parameters changed between them,
 * which would make the drift score comparison unreliable.
 */
export interface ConfigChangeWarning {
  hasChanged:  boolean
  message:     string | null
  prevHash:    string
  currHash:    string
}

export function checkConfigChange(
  prevConfigHash: string | undefined,
  currConfigHash: string | undefined
): ConfigChangeWarning {
  if (!prevConfigHash || !currConfigHash) {
    return {
      hasChanged: false,
      message:    null,
      prevHash:   prevConfigHash ?? "unknown",
      currHash:   currConfigHash ?? "unknown",
    }
  }

  if (prevConfigHash === currConfigHash) {
    return { hasChanged: false, message: null, prevHash: prevConfigHash, currHash: currConfigHash }
  }

  return {
    hasChanged: true,
    message:    "Query parameters changed between snapshots. Drift score comparison may be unreliable — " +
                "a change in numResults, category, or domain filters affects what Exa returns " +
                "independently of any real SERP change.",
    prevHash:   prevConfigHash,
    currHash:   currConfigHash,
  }
}