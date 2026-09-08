import { normalizeAlgorithmEvents } from "../AlgorithmUpdatePanel"

describe("AlgorithmUpdatePanel event normalization", () => {
  test("accepts an empty response", () => {
    expect(normalizeAlgorithmEvents([])).toEqual([])
  })

  test("keeps valid events while skipping malformed legacy affectedQueries", () => {
    const valid = { eventId: "valid", affectedQueries: "[]" }
    const malformed = { eventId: "bad", affectedQueries: "{" }
    expect(normalizeAlgorithmEvents([valid, malformed])).toEqual([
      expect.objectContaining({ eventId: "valid", affectedQueries: [] }),
    ])
  })
})
