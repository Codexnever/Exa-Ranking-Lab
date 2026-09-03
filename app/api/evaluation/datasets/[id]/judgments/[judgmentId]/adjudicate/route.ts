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
  parseAdjudicationInput,
} from "@/app/services/evaluation/evaluation-input-validation"

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string; judgmentId: string }> },
) {
  try {
    const { id, judgmentId } = await route.params

    assertRouteId("dataset ID", id)
    assertRouteId("judgment ID", judgmentId)

    const input = parseAdjudicationInput(
      await request.json().catch(() => {
        throw invalid("Request body must be valid JSON")
      }),
    )

    const judgment = await relevanceJudgmentService.adjudicate(
      context.user.$id,
      id,
      judgmentId,
      input.grade,
      input.rationale,
    )

    return NextResponse.json(judgment)
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

    console.error("[JudgmentAdjudication] failed", error)

    return NextResponse.json(
      { error: "Failed to adjudicate judgment" },
      { status: 500 },
    )
  }
}

export const POST = withEnhancedSecurity(handler, {
  allowedMethods: ["POST"],
  logAttempts: true,
})