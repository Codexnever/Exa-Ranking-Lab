import { type NextRequest, NextResponse } from "next/server"

import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

import { evaluationDatasetService } from "@/app/services/evaluation/evaluation-dataset-service"
import {
  EvaluationError,
  invalid,
} from "@/app/services/evaluation/evaluation-errors"
import {
  assertRouteId,
  parseCloneInput,
} from "@/app/services/evaluation/evaluation-input-validation"

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params

    assertRouteId("dataset ID", id)

    const raw = await request.text()
    let parsed: unknown = undefined

    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw invalid("Request body must be valid JSON")
      }
    }

    const input = parseCloneInput(parsed)

    const dataset = await evaluationDatasetService.cloneFrozenDataset(
      context.user.$id,
      id,
      input,
    )

    return NextResponse.json(dataset, { status: 201 })
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

    console.error("[EvaluationDatasetClone] failed", error)

    return NextResponse.json(
      { error: "Failed to clone evaluation dataset" },
      { status: 500 },
    )
  }
}

export const POST = withEnhancedSecurity(handler, {
  allowedMethods: ["POST"],
  logAttempts: true,
})