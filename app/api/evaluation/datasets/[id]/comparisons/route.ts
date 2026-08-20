import {type NextRequest,NextResponse} from "next/server"
import {evaluationComparisonService} from "@/app/services/evaluation/evaluation-comparison-service"
import {EvaluationError,invalid} from "@/app/services/evaluation/evaluation-errors"
import {assertRouteId} from "@/app/services/evaluation/evaluation-input-validation"
import {withEnhancedSecurity} from "@/lib/middleware/security/security-middleware"
import type {SecurityContext} from "@/types/type"
async function handler(request:NextRequest,context:SecurityContext,route:{params:Promise<{id:string}>}){try{const{id}=await route.params;assertRouteId("dataset ID",id);const input=await request.json().catch(()=>{throw invalid("Request body must be valid JSON")});return NextResponse.json(await evaluationComparisonService.compare(context.user.$id,id,input))}catch(error){if(error instanceof EvaluationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});console.error("[EvaluationComparison] failed",error);return NextResponse.json({error:"Failed to compare evaluation runs"},{status:500})}}
export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})

