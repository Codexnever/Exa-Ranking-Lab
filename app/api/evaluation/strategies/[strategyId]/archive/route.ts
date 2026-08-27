import {NextResponse,type NextRequest} from "next/server";
import type {SecurityContext} from "@/types/type";
import {withEnhancedSecurity} from "@/lib/middleware/security/security-middleware";
import {assertRouteId} from "@/app/services/evaluation/evaluation-input-validation";
import {evaluationStrategyService} from "@/app/services/evaluation/evaluation-strategy-service";
import {EvaluationError} from "@/app/services/evaluation/evaluation-errors"
async function handler(_r:NextRequest,c:SecurityContext,route:
    {params:Promise<{strategyId:string}>}
)
{
    try{
        const{strategyId}=await route.params;assertRouteId("strategy ID",strategyId);
        return NextResponse.json(
            await evaluationStrategyService.archiveStrategy(c.user.$id,strategyId))
        }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Strategy archive failed"},
            {status:e instanceof EvaluationError?e.status:500})
        }}
            export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})
