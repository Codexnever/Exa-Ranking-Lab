import {HARD_NEGATIVE_POLICY_VERSION} from "@/types/evaluation-hard-negatives"
import {CANONICALIZATION_VERSION} from "@/utils/canonicalize-url-policy"
export const HARD_NEGATIVE_POLICY=Object.freeze({
    version:HARD_NEGATIVE_POLICY_VERSION,
    canonicalizationVersion:CANONICALIZATION_VERSION,
    irrelevantGrade:0,
    topRank:5,
    topK:10,
    criticalRank:1,
    highRank:3,
    repeatedTop10Runs:2,
    repeatedTop5RunsForHigh:3,
    repeatedTop3RunsForCritical:2,
    materialPromotion:3,
    maxRuns:100,
    scorePolicy:"preserve-with-stage-score-type-no-cross-type-comparison",
    historyScope:"same-dataset-version-query-document",
    sorting:"severity-best-rank-occurrence-count-document-key",
    persisted:false
} as const)
