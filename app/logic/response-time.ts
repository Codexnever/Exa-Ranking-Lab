/** Saved timings only. Legacy zero values are ambiguous and remain unavailable. */
export function measuredResponseTime(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function averageResponseTime(snapshots: ReadonlyArray<{ metadata?: { responseTime?: unknown } }>): number | undefined {
  const values = snapshots.map(s => measuredResponseTime(s.metadata?.responseTime))
    .filter((value): value is number => value !== undefined)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
}
