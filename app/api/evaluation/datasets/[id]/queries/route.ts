import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"
import { evaluationDatasetService } from "@/app/services/evaluation/evaluation-dataset-service"
import { EvaluationError, invalid } from "@/app/services/evaluation/evaluation-errors"
import { assertRouteId,parseQueryIds } from "@/app/services/evaluation/evaluation-input-validation"

async function handler(request:NextRequest,context:SecurityContext,route:{params:Promise<{id:string}>}) {
  try { const {id}=await route.params; assertRouteId("dataset ID",id); const queryIds=parseQueryIds(await request.json().catch(() => { throw invalid("Request body must be valid JSON") })); return NextResponse.json(await evaluationDatasetService.addOperationalQueries(context.user.$id,id,queryIds)) }
  catch(error) { if(error instanceof EvaluationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status}); console.error("[EvaluationDatasetQueries] failed",error); return NextResponse.json({error:"Failed to add benchmark queries"},{status:500}) }
}
export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})
