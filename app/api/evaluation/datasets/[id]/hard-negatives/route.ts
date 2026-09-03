import { NextResponse, type NextRequest } from "next/server"

import type { SecurityContext } from "@/types/type"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"
import {
  EvaluationError,
  invalid,
} from "@/app/services/evaluation/evaluation-errors"
import { evaluationHardNegativeService } from "@/app/services/evaluation/evaluation-hard-negative-service"

const page = (
  params: URLSearchParams,
  key: string,
  fallback: number,
) => {
  const value = params.get(key)

  if (value === null) {
    return fallback
  }

  if (!/^\d+$/.test(value)) {
    throw invalid(`${key} must be a non-negative integer`)
  }

  return Number(value)
}

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params

    assertRouteId("dataset ID", id)

    const params = request.nextUrl.searchParams
    const allowed = new Set([
      "evaluationQueryId",
      "runId",
      "severity",
      "limit",
      "offset",
    ])

    if ([...params.keys()].some((key) => !allowed.has(key))) {
      throw invalid("Unsupported hard-negative filter")
    }

    const result = await evaluationHardNegativeService.analyze(
      context.user.$id,
      id,
      {
        evaluationQueryId:
          params.get("evaluationQueryId") ?? undefined,
        runId: params.get("runId") ?? undefined,
        severity: params.get("severity") as
          | "low"
          | "medium"
          | "high"
          | "critical"
          | undefined,
        limit: page(params, "limit", 50),
        offset: page(params, "offset", 0),
      },
    )

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof EvaluationError || error instanceof TypeError) {
      return NextResponse.json(
        {
          error: error.message,
          code:
            error instanceof EvaluationError
              ? error.code
              : "INVALID_STATE",
        },
        {
          status:
            error instanceof EvaluationError
              ? error.status
              : 400,
        },
      )
    }

    console.error("[HardNegatives] failed", error)

    return NextResponse.json(
      { error: "Failed to analyze hard negatives" },
      { status: 500 },
    )
  }
}

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})