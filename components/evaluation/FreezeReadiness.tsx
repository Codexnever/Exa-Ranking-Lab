import { Alert,AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { QueryFoundationReadiness } from "@/types/evaluation"
import { CheckCircle2,AlertCircle } from "lucide-react"

export function FreezeReadiness({readiness}:{readiness:QueryFoundationReadiness}){
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><Badge variant={readiness.queryFoundationReady?"default":"secondary"}>Query foundation: {readiness.queryFoundationReady?"Ready":"Incomplete"}</Badge><Badge variant={readiness.judgmentFoundationReady?"default":"secondary"}>Judgments: {readiness.judgmentFoundationReady?"Ready":"Incomplete"}</Badge><Badge variant={readiness.fullEvaluationFreezeReady?"default":"destructive"}>Freeze: {readiness.fullEvaluationFreezeReady?"Ready":"Blocked"}</Badge></div>
    <Alert variant={readiness.fullEvaluationFreezeReady?"default":"destructive"}>{readiness.fullEvaluationFreezeReady?<CheckCircle2 className="h-4 w-4"/>:<AlertCircle className="h-4 w-4"/>}<AlertDescription><strong className="block">{readiness.fullEvaluationFreezeReady?"Ready to freeze":"Cannot freeze yet"}</strong>{readiness.reasons.length?<ul className="list-disc pl-5">{readiness.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:"All server readiness checks pass."}</AlertDescription></Alert>
  </div>
}
