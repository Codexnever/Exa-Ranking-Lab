import { type NextRequest, NextResponse } from "next/server"

import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

import { evaluationDatasetService } from "@/app/services/evaluation/evaluation-dataset-service"
import { EvaluationError } from "@/app/services/evaluation/evaluation-errors"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"

async function handler(
  _request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params

    // Validate the route parameter before accessing dataset data.
    assertRouteId("dataset ID", id)

    const dataset = await evaluationDatasetService.getDatasetDetail(
      context.user.$id,
      id,
    )

    return NextResponse.json(dataset)
  } catch (error) {
    // Preserve known evaluation errors and their HTTP status codes.
    if (error instanceof EvaluationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("[EvaluationDatasetDetail] failed", error)

    return NextResponse.json(
      { error: "Failed to read evaluation dataset" },
      { status: 500 },
    )
  }
}

export const GET = withEnhancedSecurity(handler, {
  allowedMethods: ["GET"],
  logAttempts: true,
})