import { type NextRequest, NextResponse } from "next/server"

import { evaluationRunService } from "@/app/services/evaluation/evaluation-run-service"
import { EvaluationError } from "@/app/services/evaluation/evaluation-errors"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

async function handler(
  _request: NextRequest,
  context: SecurityContext,
  route: {
    params: Promise<{
      id: string
      runId: string
    }>
  },
) {
  try {
    const { id, runId } = await route.params

    assertRouteId("dataset ID", id)
    assertRouteId("run ID", runId)

    const run = await evaluationRunService.getRun(
      context.user.$id,
      id,
      runId,
    )

    return NextResponse.json(run)
  } catch (error) {
    if (error instanceof EvaluationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("[EvaluationRunDetail] failed", error)

    return NextResponse.json(
      { error: "Failed to read evaluation run" },
      { status: 500 },
    )
  }
}

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})