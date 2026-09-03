import { type NextRequest, NextResponse } from "next/server"

import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

import { relevanceJudgmentService } from "@/app/services/evaluation/relevance-judgment-service"
import {
  EvaluationError,
  invalid,
} from "@/app/services/evaluation/evaluation-errors"
import {
  assertRouteId,
  parseJudgmentBatch,
} from "@/app/services/evaluation/evaluation-input-validation"

function fail(error: unknown) {
  if (error instanceof EvaluationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    )
  }

  console.error("[EvaluationJudgments] failed", error)

  return NextResponse.json(
    { error: "Judgment operation failed" },
    { status: 500 },
  )
}

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: {
    params: Promise<{
      id: string
      evaluationQueryId: string
    }>
  },
) {
  try {
    const { id, evaluationQueryId } = await route.params

    assertRouteId("dataset ID", id)
    assertRouteId("evaluation query ID", evaluationQueryId)

    if (request.method === "GET") {
      const judgments =
        await relevanceJudgmentService.getJudgmentsForEvaluationQuery(
          context.user.$id,
          id,
          evaluationQueryId,
        )

      return NextResponse.json(judgments)
    }

    const body = parseJudgmentBatch(
      await request.json().catch(() => {
        throw invalid("Request body must be valid JSON")
      }),
    )

    const judgments = await relevanceJudgmentService.submitDirectLabels(
      context.user.$id,
      id,
      evaluationQueryId,
      body,
    )

    return NextResponse.json(judgments)
  } catch (error) {
    return fail(error)
  }
}

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})

export const PUT = withEnhancedSecurity(handler, {
  allowedMethods: ["PUT"],
  logAttempts: true,
})