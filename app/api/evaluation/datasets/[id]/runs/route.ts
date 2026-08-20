import { type NextRequest,NextResponse } from "next/server"
import { evaluationRunService } from "@/app/services/evaluation/evaluation-run-service"
import { EvaluationError,invalid } from "@/app/services/evaluation/evaluation-errors"
import { assertRouteId } from "@/app/services/evaluation/evaluation-input-validation"
import { withEnhancedSecurity } from "@/lib/middleware/security/security-middleware"
import type { SecurityContext } from "@/types/type"

function page(search:URLSearchParams,key:string,defaultValue:number){const raw=search.get(key);if(raw===null)return defaultValue;if(!/^\d+$/.test(raw))throw invalid(`${key} must be a non-negative integer`);return Number(raw)}
async function handler(request:NextRequest,context:SecurityContext,route:{params:Promise<{id:string}>}){try{const{id}=await route.params;assertRouteId("dataset ID",id);if(request.method==="GET")return NextResponse.json(await evaluationRunService.listRuns(context.user.$id,id,{limit:page(request.nextUrl.searchParams,"limit",20),offset:page(request.nextUrl.searchParams,"offset",0)}));const input=await request.json().catch(()=>{throw invalid("Request body must be valid JSON")});return NextResponse.json(await evaluationRunService.createRun(context.user.$id,id,input),{status:201})}catch(error){if(error instanceof EvaluationError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});console.error("[EvaluationRuns] failed",error);return NextResponse.json({error:"Evaluation run operation failed"},{status:500})}}
export const GET=withEnhancedSecurity(handler,{allowedMethods:["GET"],logAttempts:true})
export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})

