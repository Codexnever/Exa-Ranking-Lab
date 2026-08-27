import {NextResponse,type NextRequest} from "next/server"
import type {SecurityContext} from "@/types/type"
import {withEnhancedSecurity} from "@/lib/middleware/security/security-middleware"
import {evaluationStrategyService} from "@/app/services/evaluation/evaluation-strategy-service"
import {EvaluationError,invalid} from "@/app/services/evaluation/evaluation-errors"
async function handler(request:NextRequest,context:SecurityContext)
{
    try{
        if(request.method==="GET")
            return NextResponse.json({strategies:await evaluationStrategyService.listStrategies(context.user.$id,request.nextUrl.searchParams.get("includeArchived")==="true")});
        const input=await request.json(

        ).catch(()=>{
            throw invalid("Request body must be valid JSON")
        });
        return NextResponse.json(await evaluationStrategyService.createStrategy(context.user.$id,input),{status:201})
    }
    catch(error)
    {
        if(error instanceof EvaluationError||error instanceof TypeError)
            return NextResponse.json({error:error.message},
        {status:error instanceof EvaluationError?error.status:400});
        return NextResponse.json({error:"Strategy operation failed"},{status:500})}}
export const GET=withEnhancedSecurity(handler,{allowedMethods:["GET"],logAttempts:true});
export const POST=withEnhancedSecurity(handler,{allowedMethods:["POST"],logAttempts:true})
