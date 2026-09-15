import { analyticsCalculations, calculateSuccessRateByHour } from '@/app/logic/analyticsLogic'
import { averageResponseTime } from '@/app/logic/response-time'
import { analyticsHealth } from '@/app/store/analytics-health'
import { formatResponseTime } from '@/hooks/format-response-time'
import type { QueryConfig, RankingSnapshot } from '@/types/type'

const snapshot = (id: string, time: unknown) => ({ id, queryId: 'q', userId: 'owner',
  timestamp: new Date(), results: [{ url: 'https://example.com/a', domain: 'example.com', position: 1 }],
  metadata: { responseTime: time } }) as RankingSnapshot
test('traditional calculations retain raw filtered snapshots, configured categories and domain observations', () => {
  const result = analyticsCalculations([{ id: 'q', name: 'Query', category: 'news' } as QueryConfig],
    [snapshot('s', 1500)], '30d')
  expect(result.filteredSnapshots).toHaveLength(1)
  expect(result.categoryDistribution).toEqual(expect.arrayContaining([expect.objectContaining({ value: 1 })]))
  expect(result.filteredSnapshots[0].results[0].domain).toBe('example.com')
})
test('timing mean excludes absent, invalid and legacy zero values and is not an average of hourly averages', () => {
  expect(averageResponseTime([snapshot('a', 1000), snapshot('b', 1000), snapshot('c', 4000),
    snapshot('d', undefined), snapshot('e', NaN), snapshot('f', 0)])).toBe(2000)
  expect(formatResponseTime(2000)).toBe('2.00s')
  expect(formatResponseTime(undefined)).toBe('-')
  expect(averageResponseTime([snapshot('a', 'none')])).toBeUndefined()
})
test('hourly measurements expose the actual chart field without treating missing time as zero', () => {
  const hour = calculateSuccessRateByHour([snapshot('a', 2000), snapshot('b', undefined)])
    .find(row => row.timingCount === 1)!
  expect(hour.avgTime).toBe(2000)
  expect(hour.responseTime).toBe(2000)
})
const now = 1000000
const state = { dataSource: 'weaviate', connectionStatus: 'connected', vectorsAvailable: true,
  lastSuccessfulOperation: now, operationHistory: [{ timestamp: now, success: true }] }
test('health distinguishes unchecked, failed, missing inventory and inactive mode', () => {
  expect(analyticsHealth({ ...state, lastSuccessfulOperation: null }, now).quality).toBe('unknown')
  expect(analyticsHealth({ ...state, connectionStatus: 'error', lastSuccessfulOperation: null }, now).quality).toBe('poor')
  expect(analyticsHealth({ ...state, vectorsAvailable: null }, now).quality).toBe('good')
  expect(analyticsHealth({ ...state, dataSource: 'appwrite' }, now).quality).toBe('not-applicable')
})
test('health threshold boundaries retain two/five/ten-minute comparisons and success rates', () => {
  expect(analyticsHealth(state, now).quality).toBe('excellent')
  expect(analyticsHealth(state, now + 120000).quality).toBe('good')
  expect(analyticsHealth(state, now + 300000).quality).toBe('unknown')
  expect(analyticsHealth(state, now + 600001).quality).toBe('poor')
  const history = [true, true, true, false, false].map(success => ({ timestamp: now, success }))
  expect(analyticsHealth({ ...state, operationHistory: history }, now).quality).toBe('good')
})
