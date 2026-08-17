import {
  assertDatasetStatus,
  assertEvaluationDatasetVersion,
  assertJudgmentState,
  assertJudgmentStatus,
  assertRelevanceGrade,
} from "@/app/services/evaluation/evaluation-validation"
import type { EvaluationDatasetVersion } from "@/types/evaluation"

const dataset = (overrides: Partial<EvaluationDatasetVersion> = {}): EvaluationDatasetVersion => ({
  id: "dataset-v1", familyKey: "core", name: "Core", version: 1, status: "draft",
  ownerUserId: "owner", createdByUserId: "creator", createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"), queryCount: 0, judgmentCount: 0, conflictCount: 0,
  canonicalizationVersion: "1", ...overrides,
})

describe("strict evaluation validation", () => {
  test.each([0, 1, 2])("accepts authoritative relevance grade %i", grade => {
    expect(() => assertRelevanceGrade(grade)).not.toThrow()
    expect(() => assertJudgmentState("accepted", grade)).not.toThrow()
  })
  test.each([-1, 3, 1.5, "1", null])("rejects invalid relevance grade %p", grade => {
    expect(() => assertRelevanceGrade(grade)).toThrow()
  })
  test("accepted requires a grade", () => expect(() => assertJudgmentState("accepted", null)).toThrow())
  test("conflicted cannot expose a grade", () => expect(() => assertJudgmentState("conflicted", 2)).toThrow())
  test("conflicted without authoritative grade is valid", () => expect(() => assertJudgmentState("conflicted", null)).not.toThrow())
  test("pending without authoritative grade represents no accepted judgment", () => expect(() => assertJudgmentState("pending", null)).not.toThrow())
  test.each([0, -1, 1.2])("rejects dataset version %p", version => {
    expect(() => assertEvaluationDatasetVersion(dataset({ version }))).toThrow("positive integer")
  })
  test("rejects invalid statuses", () => {
    expect(() => assertDatasetStatus("open")).toThrow()
    expect(() => assertJudgmentStatus("unjudged")).toThrow()
  })
  test("requires canonicalization and identity metadata", () => {
    expect(() => assertEvaluationDatasetVersion(dataset({ canonicalizationVersion: "" }))).toThrow()
  })
  test("validates frozen metadata", () => {
    expect(() => assertEvaluationDatasetVersion(dataset({ status: "frozen" }))).toThrow("frozenAt")
    expect(() => assertEvaluationDatasetVersion(dataset({ status: "frozen", frozenAt: new Date(), frozenByUserId: "curator", conflictCount: 1 }))).toThrow("conflicts")
    expect(() => assertEvaluationDatasetVersion(dataset({ status: "frozen", frozenAt: new Date(), frozenByUserId: "curator" }))).not.toThrow()
  })
})
