import { transformEvaluationQueryDocument } from "../evaluation-document-transformers"

const header = (extra: Record<string, unknown> = {}) => ({
  $id: "q1", datasetVersionId: "d1", sourceQueryId: "s1", queryKey: "k1", name: "Query", queryText: "text",
  category: "company", includeDomainsJson: "[]", excludeDomainsJson: "[]", numResults: 10, configHash: "hash",
  createdAt: "2026-01-01T00:00:00.000Z", createdByUserId: "u1", ...extra,
})

describe("evaluation query configuration hydration", () => {
  test("hydrates an optional configuration without requiring it on the header", () => {
    expect(transformEvaluationQueryDocument(header()).searchConfig).toBeUndefined()
    expect(transformEvaluationQueryDocument({...header(), searchConfigJson: JSON.stringify({ b: 2, a: 1 })}, { config: {
      $id: "q1", evaluationQueryId: "q1", datasetVersionId: "d1", configHash: "hash", searchConfigJson: JSON.stringify({ b: 2, a: 1 }),
    }}).searchConfig).toEqual({ b: 2, a: 1 })
  })
  test("rejects malformed or foreign configuration", () => {
    expect(() => transformEvaluationQueryDocument({...header(), searchConfigJson: "{"})).toThrow("valid JSON")
    expect(() => transformEvaluationQueryDocument(header(), { config: { evaluationQueryId: "q2", datasetVersionId: "d1", configHash: "hash" } })).toThrow("does not match")
    expect(() => transformEvaluationQueryDocument(header(), { config: { evaluationQueryId: "q1", datasetVersionId: "d2", configHash: "hash" } })).toThrow("does not match")
    expect(() => transformEvaluationQueryDocument(header(), { config: { evaluationQueryId: "q1", datasetVersionId: "d1", configHash: "other" } })).toThrow("does not match")
  })
})