import {
  buildSearchResultWhere,
  calculateFullVectorAnomalies,
  cosineSimilarity,
  getRequestedWeaviateQuantization,
  planNativeRqUpdate,
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

  test("maps native certainty and distance without custom reranking inputs", () => {
    const nativeOrder = [
      { url: "https://example.com/b", similarity: 0.8, semanticDistance: 0.2 },
      { url: "https://example.com/a", similarity: 0.7, semanticDistance: 0.3 },
    ];
    expect(takeUniqueCanonicalSearchHits(nativeOrder, 2)).toEqual(nativeOrder);
  });
});

describe("native Weaviate quantization", () => {
  test("defaults to none and performs no schema mutation", () => {
    expect(getRequestedWeaviateQuantization(undefined)).toBe("none");
    expect(planNativeRqUpdate({ vectorIndexType: "hnsw", vectorIndexConfig: { ef: 64 } }, "none", "1.32.0")).toMatchObject({ action: "none", status: "none" });
  });

  test("builds RQ-8 while preserving the complete existing class", () => {
    const original = { class: "ExaRankingData", description: "keep", properties: [{ name: "url" }], vectorIndexType: "hnsw", vectorIndexConfig: { ef: 64 } };
    const plan = planNativeRqUpdate(original, "rq-8", "1.32.1");
    expect(plan.action).toBe("update");
    expect(plan.classDefinition).toMatchObject({
      description: "keep",
      properties: [{ name: "url" }],
      vectorIndexConfig: { ef: 64, rq: { enabled: true, bits: 8, rescoreLimit: 20 } },
    });
  });

  test("accepts compatible RQ and rejects conflicting or unsupported configurations", () => {
    expect(planNativeRqUpdate({ vectorIndexConfig: { rq: { enabled: true, bits: 8 } } }, "rq-8", "1.32.0").action).toBe("none");
    expect(() => planNativeRqUpdate({ vectorIndexConfig: { pq: { enabled: true } } }, "rq-8", "1.32.0")).toThrow(/will not be overwritten/);
    expect(() => planNativeRqUpdate({ vectorIndexType: "flat" }, "rq-8", "1.35.0")).toThrow(/HNSW/);
    expect(() => planNativeRqUpdate({ vectorIndexType: "hnsw" }, "rq-8", "1.31.9")).toThrow(/1\.32/);
  });
});

describe("full-vector content anomalies", () => {
  test("calculates full-vector cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  test("skips missing, non-finite, and dimension-mismatched vectors", () => {
    const rows = [
      { queryId: "q", _additional: { vector: [1, 0] } },
      { queryId: "q", _additional: { vector: [1, 0] } },
      { queryId: "q", _additional: { vector: [0, 1] } },
      { queryId: "q", _additional: { vector: [1] } },
      { queryId: "q", _additional: { vector: [Number.NaN, 0] } },
      { queryId: "q" },
    ];
    const anomalies = calculateFullVectorAnomalies(rows);
    expect(anomalies.every(item => item.detectionMethod === "full-vector cosine centroid")).toBe(true);
    expect(anomalies).toHaveLength(0);
  });

  test("reports a full-vector cosine centroid outlier with the existing output shape", () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      queryId: "q",
      url: `https://example.com/${index}`,
      _additional: { vector: [1, 0] },
    }));
    rows.push({ queryId: "q", url: "https://example.com/outlier", _additional: { vector: [-1, 0] } });
    expect(calculateFullVectorAnomalies(rows)).toEqual([
      expect.objectContaining({
        type: "content_anomaly",
        queryId: "q",
        url: "https://example.com/outlier",
        detectionMethod: "full-vector cosine centroid",
      }),
    ]);
  });
});
