import type {
  EvaluationDatasetStatus,
  EvaluationDatasetVersion,
  JudgmentStatus,
  RelevanceGrade,
} from "@/types/evaluation"

const DATASET_STATUSES = new Set<EvaluationDatasetStatus>(["draft", "frozen", "archived"])
const JUDGMENT_STATUSES = new Set<JudgmentStatus>(["pending", "accepted", "conflicted"])

export function isRelevanceGrade(value: unknown): value is RelevanceGrade {
  return value === 0 || value === 1 || value === 2
}

export function assertRelevanceGrade(value: unknown): asserts value is RelevanceGrade {
  if (!isRelevanceGrade(value)) throw new TypeError("relevanceGrade must be exactly 0, 1, or 2")
}

export function assertRequiredId(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`)
}

export function assertDatasetStatus(value: unknown): asserts value is EvaluationDatasetStatus {
  if (typeof value !== "string" || !DATASET_STATUSES.has(value as EvaluationDatasetStatus)) {
    throw new TypeError("Invalid evaluation dataset status")
  }
}

export function assertJudgmentStatus(value: unknown): asserts value is JudgmentStatus {
  if (typeof value !== "string" || !JUDGMENT_STATUSES.has(value as JudgmentStatus)) {
    throw new TypeError("Invalid judgment status")
  }
}

export function assertJudgmentState(status: unknown, relevanceGrade: unknown): void {
  assertJudgmentStatus(status)
  if (status === "accepted") {
    assertRelevanceGrade(relevanceGrade)
    return
  }
  if (relevanceGrade !== null && relevanceGrade !== undefined) {
    throw new TypeError(`${status} judgment cannot expose an authoritative relevanceGrade`)
  }
}

export function assertEvaluationDatasetVersion(dataset: EvaluationDatasetVersion): void {
  assertRequiredId("dataset.id", dataset.id)
  assertRequiredId("dataset.familyKey", dataset.familyKey)
  assertRequiredId("dataset.ownerUserId", dataset.ownerUserId)
  assertRequiredId("dataset.createdByUserId", dataset.createdByUserId)
  assertRequiredId("dataset.canonicalizationVersion", dataset.canonicalizationVersion)
  assertDatasetStatus(dataset.status)
  if (!Number.isInteger(dataset.version) || dataset.version <= 0) {
    throw new TypeError("dataset.version must be a positive integer")
  }
  for (const [name, count] of Object.entries({
    queryCount: dataset.queryCount,
    judgmentCount: dataset.judgmentCount,
    conflictCount: dataset.conflictCount,
  })) {
    if (!Number.isInteger(count) || count < 0) throw new TypeError(`dataset.${name} must be a non-negative integer`)
  }
  if (dataset.status === "frozen") {
    if (!(dataset.frozenAt instanceof Date) || Number.isNaN(dataset.frozenAt.getTime())) {
      throw new TypeError("frozen dataset requires a valid frozenAt date")
    }
    assertRequiredId("dataset.frozenByUserId", dataset.frozenByUserId)
    if (dataset.conflictCount !== 0) throw new TypeError("frozen dataset cannot contain conflicts")
  }
}
