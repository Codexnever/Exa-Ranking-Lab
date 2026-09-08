import { summarizeContentAnomalies } from "../content-anomaly-evidence"

describe("content anomaly evidence", () => {
  test("counts observations separately from affected queries and canonical documents", () => {
    const summary = summarizeContentAnomalies([
      { queryId: "q1", url: "https://example.com/a?utm_source=x", anomalyScore: 2 },
      { queryId: "q1", url: "https://example.com/a/", anomalyScore: 4 },
      { queryId: "q2", url: "https://example.com/b", anomalyScore: 3 },
    ])
    expect(summary.observations).toHaveLength(3)
    expect(summary.affectedQueries).toBe(2)
    expect(summary.uniqueDocuments).toBe(2)
    expect(summary.observations.map(item => item.anomalyScore)).toEqual([4, 3, 2])
  })
})
