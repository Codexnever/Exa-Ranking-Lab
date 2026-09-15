import { JSDOM } from 'jsdom'
import { act, StrictMode } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { ConnectionHealthProvider } from '../healthcheck/ConnectionHealthProvider'
import { RealTimeProvider } from '../healthcheck/RealTimeProvider'

let userId: string | null = 'owner'
const subscriptions: { callback: (payload: unknown) => Promise<void>; dispose: jest.Mock }[] = []
const subscribe = jest.fn((_channel: string, callback: (payload: unknown) => Promise<void>) => {
  const dispose = jest.fn()
  subscriptions.push({ callback, dispose })
  return dispose
})
const fetchQueries = jest.fn(async () => {})
const fetchSnapshotsComplete = jest.fn(async () => {})
const fetchAllSnapshots = jest.fn(async () => {})
const fetchDriftResults = jest.fn(async () => {})
const calculateAnalyticsFromSnapshots = jest.fn()
const snapshotState = { pagination: { currentPage: 1, itemsPerPage: 20 }, allSnapshots: [{ id: 's' }], fetchSnapshotsComplete, fetchAllSnapshots }
jest.mock('@/app/server/appwrite/appwrite', () => ({ client: { subscribe: (...args: Parameters<typeof subscribe>) => subscribe(...args) }, DATABASE_ID: 'db', COLLECTIONS: { QUERIES: 'q', SNAPSHOTS: 's' } }))
jest.mock('@/lib/middleware/authentication/auth-context', () => ({ useAuth: () => ({ userId, user: userId ? { $id: userId } : null }) }))
jest.mock('@/app/store', () => ({
  useQueriesStore: (select: (value: { fetchQueries: typeof fetchQueries }) => unknown) => select({ fetchQueries }),
  useSnapshotsStore: Object.assign((select: (value: typeof snapshotState) => unknown) => select(snapshotState), { getState: () => snapshotState }),
  useDriftStore: () => ({ fetchDriftResults }),
  useAnalyticsStore: (select: (value: { calculateAnalyticsFromSnapshots: typeof calculateAnalyticsFromSnapshots }) => unknown) => select({ calculateAnalyticsFromSnapshots }),
}))
let dom: JSDOM, root: Root
beforeEach(() => {
  jest.useFakeTimers()
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  root = createRoot(document.getElementById('root')!)
  userId = 'owner'
  subscriptions.length = 0
  jest.clearAllMocks()
})
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); jest.useRealTimers() })
async function render() {
  await act(async () => root.render(<StrictMode><ConnectionHealthProvider><RealTimeProvider><span>page</span></RealTimeProvider></ConnectionHealthProvider></StrictMode>))
}
test('Strict Mode leaves four active subscriptions; rerenders, pagination and idle health changes do not recreate them', async () => {
  await render()
  expect(subscribe).toHaveBeenCalledTimes(8)
  expect(subscriptions.filter(item => item.dispose.mock.calls.length === 0)).toHaveLength(4)
  snapshotState.pagination = { currentPage: 2, itemsPerPage: 50 }
  await render()
  await act(async () => { jest.advanceTimersByTime(180000) })
  await render()
  expect(subscribe).toHaveBeenCalledTimes(8)
})
test('events use current pagination; sign-out cleans subscriptions and pending refreshes', async () => {
  await render()
  snapshotState.pagination = { currentPage: 3, itemsPerPage: 50 }
  const active = subscriptions.slice(-4)
  await act(async () => {
    for (const subscription of active) await subscription.callback({ events: ['database.documents.create'], payload: { userId: 'owner', id: 's' } })
    jest.advanceTimersByTime(500)
  })
  expect(fetchSnapshotsComplete).toHaveBeenCalledWith(3, 50, 'owner')
  expect(fetchQueries).toHaveBeenCalledTimes(1)
  expect(fetchAllSnapshots).toHaveBeenCalledTimes(1)
  expect(calculateAnalyticsFromSnapshots).toHaveBeenCalledTimes(1)
  await act(async () => { await active[1].callback({ events: ['database.documents.create'], payload: { userId: 'owner' } }) })
  userId = null
  await render()
  await act(async () => { jest.advanceTimersByTime(10000) })
  expect(fetchSnapshotsComplete).toHaveBeenCalledTimes(1)
  expect(subscriptions.every(item => item.dispose.mock.calls.length === 1)).toBe(true)
})
test('user switch replaces only the intended scope and unmount cancels timers', async () => {
  await render()
  userId = 'other'
  await render()
  expect(subscribe).toHaveBeenCalledTimes(12)
  expect(subscriptions.filter(item => item.dispose.mock.calls.length === 0)).toHaveLength(4)
  await act(async () => root.render(null))
  await act(async () => { jest.advanceTimersByTime(180000) })
  expect(subscribe).toHaveBeenCalledTimes(12)
  expect(subscriptions.every(item => item.dispose.mock.calls.length === 1)).toBe(true)
})
