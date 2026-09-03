import { EvaluationWeaviateBenchmarkService } from "../evaluation-weaviate-benchmark-service";

class Datasets {
  status = "frozen";
  async getDatasetDetail(userId: string) {
    if (userId !== "owner") throw Object.assign(new Error("denied"), { code: "UNAUTHORIZED" });
    return {
      dataset: { id: "dataset", status: this.status },
      queries: [{ id: "evaluation-query", sourceQueryId: "source-query", queryText: "cheep" }],
    };
  }
}

class Judgments {
  values = [
    {
      datasetVersionId: "dataset",
      evaluationQueryId: "evaluation-query",
      sourceQueryId: "source-query",
      sourceSnapshotIds: ["snapshot-new"],
    },
  ];
  async getAcceptedJudgmentsForEvaluationQuery() {
    return this.values;
  }
}

class Searcher {
  calls: unknown[][] = [];
  async semanticSearch(...args: unknown[]) {
    this.calls.push(args);
    return [{ url: "https://example.com/result" }];
  }
}

describe("evaluation Weaviate benchmark retrieval", () => {
  test("derives query and frozen snapshot scope on the server", async () => {
    const searcher = new Searcher();
    const service = new EvaluationWeaviateBenchmarkService(
      new Datasets() as never,
      new Judgments() as never,
      searcher as never,
    );
    const result = await service.search("owner", "dataset", "evaluation-query", 10);
    expect(searcher.calls).toEqual([
      [
        "cheep",
        "owner",
        10,
        0,
        undefined,
        { sourceQueryId: "source-query", snapshotIds: ["snapshot-new"] },
      ],
    ]);
    expect(result).toMatchObject({
      datasetVersionId: "dataset",
      evaluationQueryId: "evaluation-query",
      sourceQueryId: "source-query",
      sourceSnapshotIds: ["snapshot-new"],
      count: 1,
    });
  });

  test("uses the sorted union when frozen judgments reference multiple snapshots", async () => {
    const judgments = new Judgments();
    judgments.values.push({
      ...judgments.values[0],
      sourceSnapshotIds: ["snapshot-old", "snapshot-new"],
    });
    const searcher = new Searcher();
    const service = new EvaluationWeaviateBenchmarkService(
      new Datasets() as never,
      judgments as never,
      searcher as never,
    );
    const result = await service.search("owner", "dataset", "evaluation-query");
    expect(result.sourceSnapshotIds).toEqual(["snapshot-new", "snapshot-old"]);
    expect(searcher.calls[0][5]).toEqual({
      sourceQueryId: "source-query",
      snapshotIds: ["snapshot-new", "snapshot-old"],
    });
  });

  test("rejects non-frozen datasets, unrelated queries, and missing snapshot provenance", async () => {
    const datasets = new Datasets();
    const judgments = new Judgments();
    const service = new EvaluationWeaviateBenchmarkService(
      datasets as never,
      judgments as never,
      new Searcher() as never,
    );
    datasets.status = "draft";
    await expect(service.search("owner", "dataset", "evaluation-query")).rejects.toMatchObject({
      code: "DATASET_NOT_FROZEN",
    });
    datasets.status = "frozen";
    await expect(service.search("owner", "dataset", "wrong-query")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    judgments.values[0].sourceSnapshotIds = [];
    await expect(service.search("owner", "dataset", "evaluation-query")).rejects.toThrow(
      /no source snapshot provenance/,
    );
  });

  test("rejects foreign ownership and inconsistent judgment provenance", async () => {
    const judgments = new Judgments();
    const service = new EvaluationWeaviateBenchmarkService(
      new Datasets() as never,
      judgments as never,
      new Searcher() as never,
    );
    await expect(service.search("foreign", "dataset", "evaluation-query")).rejects.toThrow(
      /denied/,
    );
    judgments.values[0].sourceQueryId = "wrong-source";
    await expect(service.search("owner", "dataset", "evaluation-query")).rejects.toThrow(
      /provenance/,
    );
  });
});
