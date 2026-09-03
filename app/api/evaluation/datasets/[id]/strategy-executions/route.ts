// Handles strategy execution requests for an evaluation dataset.
// Supports listing existing executions and creating new strategy runs.

import { NextResponse, type NextRequest } from "next/server"

import type { SecurityContext } from "@/types/type"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"
import { evaluationStrategyService } from "@/app/services/evaluation/evaluation-strategy-service"
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

    if (request.method === "GET") {
      const executions = await evaluationStrategyService.listExecutions(
        context.user.$id,
        id,
        request.nextUrl.searchParams.get("strategyId") ?? undefined,
        request.nextUrl.searchParams.get("evaluationQueryId") ?? undefined,
      )

      return NextResponse.json({ executions })
    }

    const input = await request.json().catch(() => {
      throw invalid("Request body must be valid JSON")
    })

    const execution = await evaluationStrategyService.createExecution(
      context.user.$id,
      id,
      input,
    )

    return NextResponse.json(execution, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Execution operation failed"

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

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})

export const POST = withEnhancedSecurity(handler, {
  allowedMethods: ["POST"],
  logAttempts: true,
})