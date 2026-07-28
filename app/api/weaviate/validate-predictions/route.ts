// app/api/weaviate/validate-prediction/route.ts
//
// NOTE: Route folder was "validate-predication" — renamed to "validate-prediction".
//       Update the folder name on disk to match.
//
// Computes real prediction validation metrics by comparing analyticsLogic's
// linear-regression predictedPosition against actual observed positions
// from the most recent snapshot per query.

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/middleware/authentication/auth"
import { AppwriteAnalyticsService } from "@/app/services/appwrite/analytics/AppwriteAnalyticsService"
import { databaseService } from "@/app/services/database/database-service"

// ─── Singleton ────────────────────────────────────────────────────────────────
// Stateless service — safe to share across requests.
const analyticsService = new AppwriteAnalyticsService(false)

// ─── Real metric calculations ─────────────────────────────────────────────────

/**
 * Mean Absolute Percentage Error between predicted and actual positions.
 * Lower is better. Returns 0 if no valid pairs.
 */
function calculateMAPE(pairs: Array<{ predicted: number; actual: number }>): number {
  const valid = pairs.filter(p => p.actual !== 0)
  if (!valid.length) return 0
  const sum = valid.reduce((s, p) => s + Math.abs((p.actual - p.predicted) / p.actual), 0)
  return Math.min(100, (sum / valid.length) * 100)
}

/**
 * Direction accuracy: % of predictions where the predicted trend direction
 * (up/down/stable) matches the actual change direction.
 * "Accuracy" in the context of ranking predictions.
 */
function calculateDirectionAccuracy(
  pairs: Array<{ predicted: number; actual: number; previous: number }>
): number {
  if (!pairs.length) return 0

  const correct = pairs.filter(p => {
    const predictedDir = p.predicted < p.previous ? "up"
                       : p.predicted > p.previous ? "down" : "stable"
    const actualDir    = p.actual    < p.previous ? "up"
                       : p.actual    > p.previous ? "down" : "stable"
    return predictedDir === actualDir
  }).length

  return (correct / pairs.length) * 100
}

/**
 * Precision: % of predicted "top 5" results that actually appeared in top 5.
 * Recall: % of actual "top 5" results that were predicted to be in top 5.
 */
function calculatePrecisionRecall(
  pairs: Array<{ predicted: number; actual: number }>
): { precision: number; recall: number } {
  const TOP_N = 5
  if (!pairs.length) return { precision: 0, recall: 0 }

  const predictedTop = pairs.filter(p => p.predicted <= TOP_N)
  const actualTop    = pairs.filter(p => p.actual    <= TOP_N)

  if (!predictedTop.length && !actualTop.length) return { precision: 1, recall: 1 }
  if (!predictedTop.length) return { precision: 0, recall: 0 }
  if (!actualTop.length)    return { precision: 0, recall: 0 }

  // True positives: predicted top-N AND actually in top-N
  const tp = pairs.filter(p => p.predicted <= TOP_N && p.actual <= TOP_N).length

  const precision = tp / predictedTop.length
  const recall    = tp / actualTop.length

  return { precision, recall }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ✅ Auth required — userId must come from session
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // ✅ No userId from body — always use authenticated user's ID
    //    Body is optional; we accept timeRangeMs as a configurable window
    let timeRangeMs = 90 * 24 * 60 * 60 * 1000  // default 90 days

    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      let raw: unknown
      try { raw = await request.json() } catch {
        return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const b = raw as Record<string, unknown>
        if (b.timeRangeMs !== undefined) {
          if (typeof b.timeRangeMs !== "number" || b.timeRangeMs <= 0) {
            return NextResponse.json(
              { success: false, error: "'timeRangeMs' must be a positive number" },
              { status: 400 }
            )
          }
          timeRangeMs = Math.min(b.timeRangeMs, 365 * 24 * 60 * 60 * 1000)
        }
      }
    }

    console.log(`[ValidatePrediction] userId=${user.$id}, timeRange=${timeRangeMs}ms`)

    // ── Fetch analytics (has predictedPosition + querySuccessRate) ──────────
    const analytics = await analyticsService.getAnalytics(user.$id, timeRangeMs)

    // ── Fetch recent snapshots to get actual observed positions ─────────────
    const snapshots = await databaseService.snapshotService.getSnapshots(
      undefined,   // all queries
      user.$id,
      200          // last 200 snapshots — enough for meaningful validation
    )

    // ── Build predicted vs actual pairs ─────────────────────────────────────
    // Group snapshots by queryId, sorted oldest→newest
    const byQuery = new Map<string, typeof snapshots>()
    for (const s of snapshots) {
      const bucket = byQuery.get(s.queryId) ?? []
      bucket.push(s)
      byQuery.set(s.queryId, bucket)
    }

    const pairs: Array<{ predicted: number; actual: number; previous: number }> = []

    for (const snaps of byQuery.values()) {
      if (snaps.length < 3) continue  // need at least 3 to predict+validate

      // Sort oldest first
      snaps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      // Use first n-1 snapshots to "predict" (as analyticsLogic would),
      // compare against the last snapshot's actual average position
      const history = snaps.slice(0, -1)
      const latest  = snaps[snaps.length - 1]
      const prev    = snaps[snaps.length - 2]

      const histPositions = history.flatMap(s =>
        (s.results ?? []).map(r => r.position ?? 0).filter(p => p > 0)
      )
      if (!histPositions.length) continue

      // Linear regression prediction (same logic as analyticsLogic.predictTrend)
      const n    = histPositions.length
      const sumX = histPositions.reduce((s, _, i) => s + i, 0)
      const sumY = histPositions.reduce((s, y) => s + y, 0)
      const sumXY = histPositions.reduce((s, y, i) => s + i * y, 0)
      const sumX2 = histPositions.reduce((s, _, i) => s + i * i, 0)
      const denom = n * sumX2 - sumX * sumX
      const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
      const intercept = (sumY - slope * sumX) / n
      const predicted  = Math.max(1, intercept + slope * n)

      // Actual: average position in the latest snapshot
      const latestPositions = (latest.results ?? []).map(r => r.position ?? 0).filter(p => p > 0)
      if (!latestPositions.length) continue
      const actual = latestPositions.reduce((s, p) => s + p, 0) / latestPositions.length

      // Previous: average position in the second-to-last snapshot
      const prevPositions = (prev.results ?? []).map(r => r.position ?? 0).filter(p => p > 0)
      const previous = prevPositions.length
        ? prevPositions.reduce((s, p) => s + p, 0) / prevPositions.length
        : actual

      pairs.push({ predicted, actual, previous })
    }

    // ── Compute real metrics ─────────────────────────────────────────────────
    const mape              = calculateMAPE(pairs)
    const directionAccuracy = calculateDirectionAccuracy(pairs)
    const { precision, recall } = calculatePrecisionRecall(pairs)
    const f1Score = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0

    const sampleSize = pairs.length

    console.log(`[ValidatePrediction] Computed over ${sampleSize} query pairs`)

    return NextResponse.json({
      success:           true,
      sampleSize,
      // Direction accuracy: did we predict the right trend (up/down/stable)?
      accuracy:          parseFloat(directionAccuracy.toFixed(2)),
      // Precision/recall based on top-5 position predictions
      precision:         parseFloat(precision.toFixed(3)),
      recall:            parseFloat(recall.toFixed(3)),
      f1Score:           parseFloat(f1Score.toFixed(3)),
      // MAPE: average % error of predicted vs actual position
      mape:              parseFloat(mape.toFixed(2)),
      // Supplementary — query success rate from analytics (separate metric)
      querySuccessRate:  parseFloat((analytics.querySuccessRate ?? 0).toFixed(2)),
      insufficient:      sampleSize < 5,   // flag when not enough data
      message:           sampleSize < 5
        ? "Insufficient snapshot history for reliable validation (need ≥3 snapshots per query)"
        : undefined,
    })
  } catch (err) {
    console.error("[ValidatePrediction] Failed:", err)
    // ✅ No internal error details exposed to client
    return NextResponse.json(
      { success: false, error: "Failed to validate predictions" },
      { status: 500 }
    )
  }
}