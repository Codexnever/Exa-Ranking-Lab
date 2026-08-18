import {NextResponse,type NextRequest} from "next/server"
import type {SecurityContext} from "@/types/type"
import {withEnhancedSecurity} from "@/lib/middleware/security/security-middleware"
import {assertRouteId} from "@/app/services/evaluation/evaluation-input-validation"
import {EvaluationError} from "@/app/services/evaluation/evaluation-errors"
import {evaluationStageDiagnosisService} from "@/app/services/evaluation/evaluation-stage-diagnosis-service"
async function handler(_request:NextRequest,context:SecurityContext,route:{params:Promise<{traceId:string}>}){try{const{traceId}=await route.params;assertRouteId("trace ID",traceId);return NextResponse.json(await evaluationStageDiagnosisService.diagnose(context.user.$id,traceId))}catch(error){if(error instanceof EvaluationError||error instanceof TypeError)return NextResponse.json({error:error.message,code:error instanceof EvaluationError?error.code:"INVALID_STATE"},{status:error instanceof EvaluationError?error.status:409});console.error("[StageDiagnosis] failed",error);return NextResponse.json({error:"Failed to diagnose stage trace"},{status:500})}}
export const GET=withEnhancedSecurity(handler,{allowedMethods:["GET"],logAttempts:true})
