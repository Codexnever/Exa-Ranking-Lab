import { NextResponse, type NextRequest } from "next/server"

import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

import { evaluationStageTraceService } from "@/app/services/evaluation/evaluation-stage-trace-service"
import { EvaluationError } from "@/app/services/evaluation/evaluation-errors"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"

async function handler(
  _request: NextRequest,
  context: SecurityContext,
  route: {
    params: Promise<{
      traceId: string
    }>
  },
) {
  try {
    const { traceId } = await route.params

    // Validate the trace identifier before querying persisted trace data.
    assertRouteId("trace ID", traceId)

    const trace = await evaluationStageTraceService.get(
      context.user.$id,
      traceId,
    )

    return NextResponse.json(trace)
  } catch (error) {
    // Preserve expected evaluation errors and handle invalid trace state separately.
    if (
      error instanceof EvaluationError ||
      error instanceof TypeError
    ) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status:
            error instanceof EvaluationError
              ? error.status
              : 409,
        },
      )
    }

    console.error("[StageTraceDetail] failed", error)

    return NextResponse.json(
      { error: "Failed to read stage trace" },
      { status: 500 },
    )
  }
}

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})