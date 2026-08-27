import {CANONICALIZATION_VERSION} from "@/utils/canonicalize-url-policy"
import {EVALUATION_STAGE_TRACE_VERSION,EVALUATION_STAGE_TYPES} from "@/types/evaluation-stage-trace"
export const EVALUATION_STAGE_TRACE_POLICY=Object.freeze({
    version:EVALUATION_STAGE_TRACE_VERSION,
    canonicalizationVersion:CANONICALIZATION_VERSION,
    allowedStageTypes:EVALUATION_STAGE_TYPES,
    rankSemantics:"one-based-or-null",
    rankDelta:"previous-rank-minus-next-rank",
    duplicateHandling:"highest-ranked-canonical-occurrence",
    stageOrdering:"ascending-unique-integer",
    immutable:true,
    maxStages:20,
    maxDocumentsPerStage:1000,
    maxMetadataBytes:4096,
    maxRequestBytes:8_000_000
} as const)
