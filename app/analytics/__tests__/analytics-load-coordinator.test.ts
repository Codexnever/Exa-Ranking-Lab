import { AnalyticsLoadCoordinator } from "../analytics-load-coordinator"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(res => { resolve = res })
  return { promise, resolve }
}

describe("AnalyticsLoadCoordinator", () => {
  it("coalesces initial load and Strict Mode replay for the same selection", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const pending = deferred()
    const task = jest.fn(() => pending.promise)
    const first = coordinator.load("user-a|weaviate|30d", task)
    const replay = coordinator.load("user-a|weaviate|30d", task)
    expect(task).toHaveBeenCalledTimes(1)
    pending.resolve()
    await expect(Promise.all([first, replay])).resolves.toEqual(["loaded", "loaded"])
  })

  it("does not reload a completed selection during idle rerenders", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn(async () => {})
    await coordinator.load("user-a|weaviate|30d", task)
    await expect(coordinator.load("user-a|weaviate|30d", task)).resolves.toBe("cached")
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("treats an empty successful load as completed", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn(async () => {})
    await coordinator.load("user-a|weaviate|empty", task)
    await coordinator.load("user-a|weaviate|empty", task)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("allows one explicit refresh after completion", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn(async () => {})
    await coordinator.load("user-a|weaviate|30d", task)
    await coordinator.load("user-a|weaviate|30d", task, { force: true })
    expect(task).toHaveBeenCalledTimes(2)
  })

  it("stops after failure and permits an explicit retry", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn().mockRejectedValueOnce(new Error("backend unavailable")).mockResolvedValueOnce(undefined)
    await expect(coordinator.load("user-a|weaviate|30d", task)).rejects.toThrow("backend unavailable")
    expect(task).toHaveBeenCalledTimes(1)
    await expect(coordinator.load("user-a|weaviate|30d", task, { force: true })).resolves.toBe("loaded")
    expect(task).toHaveBeenCalledTimes(2)
  })

  it("loads a changed time range exactly once", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn(async () => {})
    await coordinator.load("user-a|weaviate|30d", task)
    await coordinator.load("user-a|weaviate|7d", task)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it("marks an older delayed selection stale", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const old = deferred()
    const current = deferred()
    const oldLoad = coordinator.load("user-a|weaviate|30d", () => old.promise)
    const currentLoad = coordinator.load("user-a|weaviate|7d", () => current.promise)
    current.resolve()
    await expect(currentLoad).resolves.toBe("loaded")
    old.resolve()
    await expect(oldLoad).resolves.toBe("stale")
  })

  it("does not reuse completed data across users", async () => {
    const coordinator = new AnalyticsLoadCoordinator()
    const task = jest.fn(async () => {})
    await coordinator.load("user-a|weaviate|30d", task)
    await coordinator.load("user-b|weaviate|30d", task)
    expect(task).toHaveBeenCalledTimes(2)
  })
})
