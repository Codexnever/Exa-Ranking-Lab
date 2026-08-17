import { type NextRequest, NextResponse } from "next/server"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"
import { evaluationDatasetService } from "@/app/services/evaluation/evaluation-dataset-service"
import { EvaluationError, invalid } from "@/app/services/evaluation/evaluation-errors"
import { parseCreateDatasetInput, parseListInput } from "@/app/services/evaluation/evaluation-input-validation"

function response(error: unknown) {
  if (error instanceof EvaluationError) return NextResponse.json({ error:error.message,code:error.code },{status:error.status})
  console.error("[EvaluationDatasets] storage failure",error)
  return NextResponse.json({error:"Evaluation dataset operation failed"},{status:500})
}
async function handler(request:NextRequest,context:SecurityContext) {
  try {
    if (request.method === "GET") return NextResponse.json({datasets:await evaluationDatasetService.listDatasets(context.user.$id,parseListInput(request.nextUrl.searchParams))})
    const input=parseCreateDatasetInput(await request.json().catch(() => { throw invalid("Request body must be valid JSON") }))
    return NextResponse.json(await evaluationDatasetService.createDataset(context.user.$id,input),{status:201})
  } catch(error) { return response(error) }
}
export const GET=withEnhancedSecurity(handler,{allowedMethods:["GET"],logAttempts:true})
export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})
