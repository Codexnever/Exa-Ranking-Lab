// Handles strategy benchmark requests for an evaluation dataset.
// Validates the dataset and request payload before running the benchmark service.

import { NextResponse, type NextRequest } from "next/server"

import type { SecurityContext } from "@/types/type"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"
import { evaluationStrategyBenchmarkService } from "@/app/services/evaluation/evaluation-strategy-benchmark-service"
import {
  EvaluationError,
  invalid,
} from "@/app/services/evaluation/evaluation-errors"

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params

    assertRouteId("dataset ID", id)

    const input = await request.json().catch(() => {
      throw invalid("Request body must be valid JSON")
    })

    const benchmark =
      await evaluationStrategyBenchmarkService.benchmark(
        context.user.$id,
        id,
        input,
      )

    return NextResponse.json(benchmark)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Strategy benchmark failed"

    const status =
      error instanceof EvaluationError
        ? error.status
        : error instanceof TypeError
          ? 400
          : 500

    return NextResponse.json(
      { error: message },
      { status },
    )
  }
}

export const POST = withEnhancedSecurity(handler, {
  allowedMethods: ["POST"],
  logAttempts: true,
})