import {CANONICALIZATION_VERSION} from "@/utils/canonicalize-url-policy"
import {DOCUMENT_MOVEMENT_POLICY_VERSION} from "@/types/evaluation-document-movement"
export const DOCUMENT_MOVEMENT_POLICY=Object.freeze({version:DOCUMENT_MOVEMENT_POLICY_VERSION,canonicalizationVersion:CANONICALIZATION_VERSION,duplicateHandling:"highest-ranked-canonical-occurrence",rankDelta:"before-rank-minus-after-rank",relevantGradeThreshold:1,materialRankChange:3,cutoffs:[5,10],absentBoth:"explicit-unknown",evidenceLimit:10,ordering:"top-k-transition-grade-rank-distance-document-key"} as const)

