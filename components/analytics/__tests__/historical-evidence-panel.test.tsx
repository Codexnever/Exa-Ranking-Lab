import { JSDOM } from 'jsdom'
import { act, StrictMode } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { AlgorithmUpdatePanel } from '../AlgorithmUpdatePanel'
import { readRecordedEvidence } from '@/lib/services/algorithm-detector/recorded-evidence'
import Analytics from '@/app/analytics/page'

const fetchQueries = jest.fn(async () => {})
const fetchAllSnapshots = jest.fn(async () => {})
const getSemanticAnalytics = jest.fn(async () => {})
const fetchAnalytics = jest.fn(async () => {})
const syncQueries = jest.fn()
const queryState = { queries: [], fetchQueries }
const snapshotState = { allSnapshots: [], fetchAllSnapshots }
const analyticsState = { analytics: null, dataSource: 'weaviate', fetchAnalytics }
const weaviateState = { isConnected: false, connectionStatus: 'disconnected',
  getSemanticAnalytics, syncQueries, semanticInsights: null, enhancedMetrics: null }
jest.mock('@/app/store', () => ({ useAnalyticsStore: () => analyticsState }))
jest.mock('@/app/store/use-queries-store', () => ({ useQueriesStore: Object.assign(() => queryState, { getState: () => queryState }) }))
jest.mock('@/app/store/use-snapshots-store', () => ({ useSnapshotsStore: () => snapshotState }))
jest.mock('@/app/store/weaviate-store', () => ({ useWeaviateStore: () => weaviateState }))
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }))
jest.mock('@/components/analytics/PredictiveRankingsWidget', () => ({ PredictiveRankingsWidget: () => null }))
jest.mock('@/components/analytics/SemanticHeatmap', () => ({ SemanticHeatmap: () => null }))
jest.mock('@/components/analytics/SERPJourneyFlow', () => ({ SERPJourneyFlow: () => null }))
jest.mock('@/components/analytics/RevolutionaryStatsCard', () => ({ RevolutionaryStatsCard: () => null }))

let auth: { user: { $id: string } | null; initializing: boolean }
const call = jest.fn()
jest.mock('@/lib/middleware/authentication/auth-context', () => ({ useAuth: () => auth }))
jest.mock('@/lib/api/use-secureApi', () => ({ useSecureApi: () => ({ call }) }))

function event(evidence: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return { id: 'event', category: 'research', detectedAt: '2026-09-01T00:00:00Z', severity: 'minor',
    description: 'Authoritative saved description.', affectedQueries: [], driftRate: .7, avgDriftScore: 45,
    recordedEvidence: readRecordedEvidence({ schemaVersion: 2, detectorVersion: '2.1',
      detectionMode: 'baseline-aware', historicalBaselineAvailable: true,
      currentObservedAverageDrift: 42, affectedAverageDrift: 55,
      evidenceJson: JSON.stringify({ baselineMedian: 10, baselineMedianAbsoluteDeviation: 2,
        historicalDeviation: 10.79, historicalComparisonMethod: 'robust-mad', ...evidence }), ...overrides }) }
}
let dom: JSDOM, container: HTMLDivElement, root: Root
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  auth = { user: { $id: 'owner' }, initializing: false }
  call.mockReset().mockResolvedValue([])
  fetchQueries.mockClear()
  fetchAllSnapshots.mockClear()
  getSemanticAnalytics.mockReset().mockResolvedValue(undefined)
  fetchAnalytics.mockClear()
  syncQueries.mockClear()
  analyticsState.dataSource = 'weaviate'
})
afterEach(async () => { await act(async () => root.unmount()); dom.window.close() })
async function render(active = true) { await act(async () => root.render(<StrictMode><AlgorithmUpdatePanel active={active} /></StrictMode>)) }
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

test('empty events retain the explanation and do not claim a stable evaluation', async () => {
  await render()
  expect(container.textContent).toContain('No saved ranking-change candidates found')
  expect(container.textContent).toContain('does not establish that detection ran')
  expect(container.textContent).toContain('Coverage:')
  expect(container.textContent).toContain('Limited history:')
  expect(call).toHaveBeenCalledTimes(1)
})
test('failure retains explanation, ends loading, and explicit Retry requests once', async () => {
  call.mockRejectedValueOnce(new Error('private backend detail')).mockResolvedValueOnce([])
  await render()
  expect(container.textContent).toContain('History:')
  expect(container.textContent).toContain('could not be loaded')
  expect(container.textContent).not.toContain('private backend detail')
  await click('Retry')
  expect(call).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain('No saved ranking-change candidates')
})
test('Strict Mode, stable rerenders, tab revisits and disclosures add no requests; refresh adds one', async () => {
  call.mockResolvedValue([event()])
  await render(false)
  expect(call).not.toHaveBeenCalled()
  await render()
  await render()
  await act(async () => container.querySelector('summary')!.click())
  await render(false)
  await render()
  expect(call).toHaveBeenCalledTimes(1)
  await click('Refresh saved events')
  expect(call).toHaveBeenCalledTimes(2)
  expect(call).toHaveBeenLastCalledWith('GET', '/analytics/algorithm-events?limit=10')
})
test('baseline evidence separates observed and affected averages and preserves the stored description', async () => {
  call.mockResolvedValue([event()])
  await render()
  expect(container.textContent).toContain('Authoritative saved description.')
  const rows = [...container.querySelectorAll('dl > div')]
  expect(rows.find(row => row.textContent?.includes('all observed queries'))?.textContent).toContain('42')
  expect(rows.find(row => row.textContent?.includes('Affected-query'))?.textContent).toContain('55')
  expect(container.textContent).toContain('Historical median10')
  expect(container.querySelector('svg')).toBeNull()
})
test('fixed-threshold records explain unavailable history and the recorded confidence cap', async () => {
  call.mockResolvedValue([event({ baselineAvailabilityReason: 'Too few historical windows',
    baselineAvailabilityReasonCode: 'insufficient_valid_windows', historicalComparisonMethod: 'unavailable' },
    { detectionMode: 'fixed-threshold', historicalBaselineAvailable: false,
      confidenceJson: JSON.stringify({ percentage: 49, confidenceCapped: true, confidenceCap: 49, confidenceCapReason: 'History unavailable' }) })])
  await render()
  expect(container.textContent).toContain('Explicitly unavailable')
  expect(container.textContent).toContain('Too few historical windows')
  expect(container.textContent).toContain('Confidence capped: Yes')
  expect(container.textContent).toContain('History unavailable')
})
test('zero MAD uses epsilon and never displays non-finite deviation', async () => {
  call.mockResolvedValue([event({ baselineMedianAbsoluteDeviation: 0, historicalComparisonMethod: 'absolute-epsilon',
    historicalDeviation: null, baselineAbsoluteEpsilon: 5 })])
  await render()
  expect(container.textContent).toContain('absolute-epsilon rule')
  expect(container.textContent).toContain('recorded epsilon (5)')
  expect(container.textContent).not.toMatch(/NaN|Infinity/)
  expect(container.textContent).toContain('Median absolute deviation (MAD)0')
})
test('legacy injected defaults are never shown as recorded history and malformed siblings are isolated', async () => {
  call.mockResolvedValue([{ ...event(), recordedEvidence: undefined, evidence: { baselineMedian: 0 } },
    { ...event(), id: 'bad', affectedQueries: '{' }])
  await render()
  expect(container.querySelectorAll('section[aria-label]')).toHaveLength(1)
  expect(container.textContent).toContain('Historical medianNot recorded for this event')
  expect(container.textContent).toContain('Detection mode: Not recorded')
})
test('authentication loading and signed-out states never fetch', async () => {
  auth = { user: null, initializing: true }
  await render()
  expect(container.textContent).toContain('Checking authentication')
  auth.initializing = false
  await render()
  expect(container.textContent).toContain('Sign in')
  expect(call).not.toHaveBeenCalled()
})
test('late old-user responses cannot populate a new-user panel', async () => {
  let release!: (data: unknown) => void
  call.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    .mockResolvedValueOnce([])
  await render()
  auth = { user: { $id: 'new-owner' }, initializing: false }
  await render()
  await act(async () => release([event()]))
  expect(container.textContent).not.toContain('Authoritative saved description')
  expect(call).toHaveBeenCalledTimes(2)
})
test('unmount ignores pending results without starting further requests', async () => {
  let release!: (data: unknown) => void
  call.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  await render()
  await act(async () => root.render(null))
  await act(async () => release([event()]))
  expect(container.textContent).toBe('')
  expect(call).toHaveBeenCalledTimes(1)
})

test.each(['weaviate', 'appwrite'])('Ranking Changes remains accessible with no data in %s mode without reloading Analytics', async source => {
  analyticsState.dataSource = source
  getSemanticAnalytics.mockRejectedValue(new Error('semantic initialization unavailable'))
  const renderPage = async () => { await act(async () => root.render(<StrictMode><Analytics /></StrictMode>)) }
  const selectTab = async (label: string) => {
    const tab = [...container.querySelectorAll('[role=tab]')].find(item => item.textContent === label)!
    expect(tab).toBeDefined()
    await act(async () => tab.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 })))
  }
  await renderPage()
  expect(fetchQueries).toHaveBeenCalledTimes(1)
  expect(fetchAllSnapshots).toHaveBeenCalledTimes(1)
  expect(call).not.toHaveBeenCalled()
  await selectTab('Ranking Changes')
  expect(container.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toContain('Ranking-Change Detection')
  await renderPage()
  await selectTab('Overview')
  await selectTab('Ranking Changes')
  expect(call).toHaveBeenCalledTimes(1)
  expect(fetchQueries).toHaveBeenCalledTimes(1)
  expect(fetchAllSnapshots).toHaveBeenCalledTimes(1)
  expect(getSemanticAnalytics).toHaveBeenCalledTimes(source === 'weaviate' ? 1 : 0)
  expect(fetchAnalytics).toHaveBeenCalledTimes(source === 'appwrite' ? 1 : 0)
  expect(syncQueries).not.toHaveBeenCalled()
})
