import { createSnapshotStorage, snapshotPreferences } from '../snapshot-persistence'
import { useSnapshotsStore } from '../use-snapshots-store'
import { JSDOM } from 'jsdom'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
const fixtures = Array.from({ length: 11 }, (_, i) => ({ id: String(i), timestamp: '2026-09-01',
  results: Array.from({ length: 50 }, () => ({ text: 'x'.repeat(10000) })) }))
beforeEach(() => { useSnapshotsStore.getState().clearSnapshots(); global.fetch = jest.fn() })
afterEach(() => { jest.restoreAllMocks() })

test('large complete snapshots serialize only bounded preferences, not analytical inputs', () => {
  const previous = JSON.stringify({ allSnapshots: fixtures })
  const next = JSON.stringify({ state: snapshotPreferences({ allSnapshots: fixtures, pagination: { itemsPerPage: 50 } }), version: 1 })
  expect(Buffer.byteLength(previous)).toBeGreaterThan(5500000)
  expect(Buffer.byteLength(next)).toBeLessThan(100)
  expect(next).not.toContain('results')
})
test('quota failure is fail-open and identical writes are attempted only once', () => {
  const setItem = jest.fn(() => { throw new DOMException('quota', 'QuotaExceededError') })
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const storage = createSnapshotStorage(() => ({ setItem } as unknown as Storage))
  for (let i = 0; i < 20; i++) storage.setItem('snapshots-storage', '{"state":{}}')
  expect(setItem).toHaveBeenCalledTimes(1)
  expect(warning).toHaveBeenCalledTimes(1)
  storage.setItem('snapshots-storage', '{"state":{"pagination":{"itemsPerPage":50}}}')
  expect(setItem).toHaveBeenCalledTimes(2)
})
test('old cache preserves page size but never restores data, ownership or freshness', async () => {
  const dom = new JSDOM('', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window })
  dom.window.localStorage.setItem('snapshots-storage', JSON.stringify({ version: 0, state: {
    pagination: { itemsPerPage: 50 }, allSnapshots: fixtures.slice(0, 1), lastUserId: 'old', lastFetch: 123, isHydrated: true } }))
  await useSnapshotsStore.persist.rehydrate()
  expect(useSnapshotsStore.getState().allSnapshots).toEqual([])
  expect(useSnapshotsStore.getState().lastFetch).toBeNull()
  expect(useSnapshotsStore.getState().pagination.itemsPerPage).toBe(50)
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)
  await useSnapshotsStore.getState().checkAndRefreshIfEmpty('new')
  await useSnapshotsStore.getState().checkAndRefreshIfEmpty('new')
  expect(fetch).toHaveBeenCalledTimes(1)
  dom.window.close()
})
test('malformed and unavailable storage, including SSR, are safe misses', () => {
  for (const raw of ['{', 'null', '[]']) {
    expect(createSnapshotStorage(() => ({ getItem: () => raw } as unknown as Storage)).getItem('snapshots-storage')).toBeNull()
  }
  expect(createSnapshotStorage(() => { throw new Error('disabled') }).getItem('snapshots-storage')).toBeNull()
  expect(createSnapshotStorage(() => undefined).getItem('snapshots-storage')).toBeNull()
})
test('successful fetch retains full data despite quota and ordinary state updates do not write again', async () => {
  const dom = new JSDOM('', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window })
  const write = jest.spyOn(dom.window.Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  useSnapshotsStore.setState({ pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 37 } })
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => fixtures } as Response)
  await useSnapshotsStore.getState().fetchAllSnapshots('owner')
  for (let i = 0; i < 10; i++) useSnapshotsStore.setState({ isLoadingCompare: false })
  expect(useSnapshotsStore.getState().allSnapshots).toEqual(fixtures)
  expect(useSnapshotsStore.getState().isLoadingAnalytics).toBe(false)
  expect(useSnapshotsStore.getState().error).toBeNull()
  expect(write).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  dom.window.close()
})
test('switching users clears old data immediately and ignores late responses after sign-out', async () => {
  let release!: (response: Response) => void
  jest.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
  const old = useSnapshotsStore.getState().fetchAllSnapshots('old')
  await useSnapshotsStore.getState().fetchAllSnapshots('new')
  release({ ok: true, json: async () => fixtures } as Response)
  await old
  expect(useSnapshotsStore.getState().allSnapshots).toEqual([])
  expect(useSnapshotsStore.getState().lastUserId).toBe('new')
  useSnapshotsStore.getState().clearSnapshots()
  expect(useSnapshotsStore.getState().lastFetch).toBeNull()
})
