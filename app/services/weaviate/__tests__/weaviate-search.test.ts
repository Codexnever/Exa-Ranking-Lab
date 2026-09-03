import {
  buildSearchResultWhere,
  takeUniqueCanonicalSearchHits,
} from "../weaviate-service";

describe("Weaviate ranked search", () => {
  test("deduplicates canonical documents before applying the final limit", () => {
    const ranked = [
      { id: "a-high", url: "https://example.com/a?utm_source=first", score: 1 },
      { id: "a-lower", url: "http://EXAMPLE.com/a/#fragment", score: 0.9 },
      { id: "b", url: "https://example.com/b", score: 0.8 },
      { id: "c", url: "https://example.com/c", score: 0.7 },
    ];
    expect(takeUniqueCanonicalSearchHits(ranked, 3).map(item => item.id)).toEqual([
      "a-high",
      "b",
      "c",
    ]);
  });

  test("collapses the observed same-URL historical records and preserves unique order", () => {
    const ranked = [
      { url: "https://gritletter.co/p/you-don-t-need-certainty-you-need-faith", position: 43, timestamp: "2026-01-01" },
      { url: "https://gritletter.co/p/you-don-t-need-certainty-you-need-faith", position: 43, timestamp: "2026-02-01" },
      { url: "https://example.com/next", position: 2, timestamp: "2026-02-01" },
      { url: "https://example.com/final", position: 3, timestamp: "2026-02-01" },
    ];
    expect(takeUniqueCanonicalSearchHits(ranked, 3).map(item => item.url)).toEqual([
      "https://gritletter.co/p/you-don-t-need-certainty-you-need-faith",
      "https://example.com/next",
      "https://example.com/final",
    ]);
  });

  test("keeps generic historical search broad but owner and record-type scoped", () => {
    expect(buildSearchResultWhere("owner")).toEqual({
      operator: "And",
      operands: [
        { path: ["recordType"], operator: "Equal", valueText: "search_result" },
        { path: ["userId"], operator: "Equal", valueText: "owner" },
      ],
    });
  });

  test("isolates benchmark candidates to owner, source query, and frozen snapshots", () => {
    const where = buildSearchResultWhere("owner", undefined, {
      sourceQueryId: "source-query",
      snapshotIds: ["snapshot-new"],
    });
    expect(where.operands).toEqual([
      { path: ["recordType"], operator: "Equal", valueText: "search_result" },
      { path: ["userId"], operator: "Equal", valueText: "owner" },
      { path: ["queryId"], operator: "Equal", valueText: "source-query" },
      { path: ["snapshotId"], operator: "Equal", valueText: "snapshot-new" },
    ]);
    expect(JSON.stringify(where)).not.toContain("snapshot-old");
    expect(JSON.stringify(where)).not.toContain("query_intent");
    expect(JSON.stringify(where)).not.toContain("drift_pattern");
  });

  test("represents a frozen multi-snapshot corpus as a bounded union", () => {
    const where = buildSearchResultWhere("owner", undefined, {
      sourceQueryId: "source-query",
      snapshotIds: ["snapshot-a", "snapshot-b"],
    });
    expect(where.operands.at(-1)).toEqual({
      operator: "Or",
      operands: [
        { path: ["snapshotId"], operator: "Equal", valueText: "snapshot-a" },
        { path: ["snapshotId"], operator: "Equal", valueText: "snapshot-b" },
      ],
    });
  });
});
