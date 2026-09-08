export type AnalyticsLoadResult = "loaded" | "cached" | "stale"

export class AnalyticsLoadCoordinator {
  private readonly inFlight = new Map<string, Promise<AnalyticsLoadResult>>()
  private readonly completed = new Set<string>()
  private currentKey: string | null = null

  select(key: string): void {
    this.currentKey = key
  }

  load(key: string, task: () => Promise<void>, options: { force?: boolean } = {}): Promise<AnalyticsLoadResult> {
    this.select(key)
    const existing = this.inFlight.get(key)
    if (existing) return existing
    if (!options.force && this.completed.has(key)) return Promise.resolve("cached")

    const request = task()
      .then(() => {
        if (this.currentKey !== key) return "stale" as const
        this.completed.add(key)
        return "loaded" as const
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key)
      })
    this.inFlight.set(key, request)
    return request
  }

  isCurrent(key: string): boolean {
    return this.currentKey === key
  }
}
