jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
import { useAnalyticsStore } from '@/app/store/use-analytics-store'
import type { AnalyticsData } from '@/types/type'

const empty = { filteredSnapshots: [], categoryDistribution: [] } as unknown as AnalyticsData
beforeEach(() => {
  useAnalyticsStore.getState().clearAnalytics()
  useAnalyticsStore.getState().setDataSource('appwrite')
})
test('empty successful loads are reused only for the same user and range; explicit refresh loads once', async () => {
  const load = jest.fn().mockResolvedValue(empty)
  useAnalyticsStore.setState({ _getAppwriteAnalytics: load })
  await useAnalyticsStore.getState().fetchAnalytics('a', 7)
  await useAnalyticsStore.getState().fetchAnalytics('a', 7)
  expect(load).toHaveBeenCalledTimes(1)
  await useAnalyticsStore.getState().fetchAnalytics('a', 30)
  await useAnalyticsStore.getState().fetchAnalytics('b', 30)
  await useAnalyticsStore.getState().fetchAnalytics('b', 30, [], true)
  expect(load).toHaveBeenCalledTimes(4)
})
test('source switching invalidates old completions and old-user responses cannot win', async () => {
  let finish!: (data: AnalyticsData) => void
  const old = new Promise<AnalyticsData>(resolve => { finish = resolve })
  const load = jest.fn().mockReturnValueOnce(old).mockResolvedValue(empty)
  useAnalyticsStore.setState({ _getAppwriteAnalytics: load })
  const pending = useAnalyticsStore.getState().fetchAnalytics('old', 30)
  await useAnalyticsStore.getState().fetchAnalytics('new', 30)
  finish({ ...empty, avgResponseTime: 999 })
  await pending
  expect(useAnalyticsStore.getState().analytics).toBe(empty)
  useAnalyticsStore.getState().setDataSource('weaviate')
  useAnalyticsStore.getState().setDataSource('appwrite')
  await useAnalyticsStore.getState().fetchAnalytics('new', 30)
  expect(load).toHaveBeenCalledTimes(3)
})
test('retrieval errors settle without legacy fallback or automatic retry', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const load = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(empty)
    useAnalyticsStore.setState({ _getAppwriteAnalytics: load })
    await useAnalyticsStore.getState().fetchAnalytics('a', 30)
    expect(useAnalyticsStore.getState()).toMatchObject({ analytics: null, isLoading: false, error: 'Unavailable' })
    expect(load).toHaveBeenCalledTimes(1)
    await useAnalyticsStore.getState().fetchAnalytics('a', 30)
    expect(useAnalyticsStore.getState().error).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  } finally { log.mockRestore() }
})
