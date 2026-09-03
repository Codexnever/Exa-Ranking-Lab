import { NextResponse, type NextRequest } from "next/server";
import type { SecurityContext } from "@/types/type";
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware";
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation";
import { EvaluationError, invalid } from "@/app/services/evaluation/evaluation-errors";
import { evaluationWeaviateBenchmarkService } from "@/app/services/evaluation/evaluation-weaviate-benchmark-service";

async function handler(
  request: NextRequest,
  context: SecurityContext,
  route: { params: Promise<{ id: string; evaluationQueryId: string }> },
) {
  try {
    const { id, evaluationQueryId } = await route.params;
    assertRouteId("dataset ID", id);
    assertRouteId("evaluation query ID", evaluationQueryId);
    const params = request.nextUrl.searchParams;
    if ([...params.keys()].some(key => key !== "limit")) {
      throw invalid("Unsupported Weaviate benchmark search parameter");
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? 10 : Number(rawLimit);
    return NextResponse.json(
      await evaluationWeaviateBenchmarkService.search(
        context.user.$id,
        id,
        evaluationQueryId,
        limit,
      ),
    );
  } catch (error) {
    if (error instanceof EvaluationError || error instanceof TypeError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error instanceof EvaluationError ? error.code : "INVALID_STATE",
        },
        { status: error instanceof EvaluationError ? error.status : 400 },
      );
    }
    console.error("[EvaluationWeaviateSearch] failed", error);
    return NextResponse.json({ error: "Failed to retrieve benchmark results" }, { status: 500 });
  }
}

export const GET = withEnhancedSecurity(handler, { allowedMethods: ["GET"], logAttempts: true });
