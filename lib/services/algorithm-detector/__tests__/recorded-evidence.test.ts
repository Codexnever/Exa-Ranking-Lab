import { documentToEvent, EventPersistence } from '../EventPersistence'
import { readRecordedEvidence, sanitizeRecordedEvidence } from '../recorded-evidence'

test('legacy deserialization preserves absence despite calculated compatibility defaults', () => {
  const result = documentToEvent({ eventId: 'legacy', category: 'news', severity: 'minor',
    detectedAt: '2026-09-01T00:00:00Z', affectedQueries: '[]', avgDriftScore: 45, description: 'Saved' })
  expect(result.metrics.currentObservedAverageDrift).toBe(45)
  expect(result.recordedEvidence?.numbers).toEqual({ avgDriftScore: 45 })
  expect(result.recordedEvidence?.flags).toEqual({})
  expect(result.storedDescription).toBe('Saved')
  expect(readRecordedEvidence({ avgDriftScore: 0, driftRate: 0 }).numbers).toEqual({ avgDriftScore: 0, driftRate: 0 })
  expect(readRecordedEvidence({}).numbers).toEqual({})
})
test('recorded zero and false survive; arbitrary fields and malformed JSON are excluded', () => {
  const result = readRecordedEvidence({ schemaVersion: 2, historicalBaselineAvailable: false,
    evidenceJson: JSON.stringify({ baselineMedian: 0, baselineMedianAbsoluteDeviation: 0, secret: 'excluded' }),
    thresholdsJson: '{', confidenceJson: 'null', userId: 'private-owner' })
  expect(result.numbers.baselineMedian).toBe(0)
  expect(result.flags.historicalBaselineAvailable).toBe(false)
  expect(JSON.stringify(result)).not.toMatch(/secret|private-owner/)
})
test('malformed numbers, dates and gates do not create measured evidence or passed gates', () => {
  const result = sanitizeRecordedEvidence({ numbers: { baselineMedian: NaN, historicalDeviation: Infinity },
    text: { windowStart: 'invalid' }, gates: [null, { code: 'coverage', message: 'not evaluated' }] })
  expect(result.numbers).toEqual({})
  expect(result.text).toEqual({})
  expect(result.gates).toEqual([{ code: 'coverage', message: 'not evaluated' }])
})
test('provider failure reason does not expose exception details', () => {
  expect(readRecordedEvidence({ schemaVersion: 2, evidenceJson: JSON.stringify({
    baselineAvailabilityReasonCode: 'provider_failure', baselineAvailabilityReason: 'private transport details',
  }) }).text.baselineAvailabilityReason).toBe('Historical baseline provider was unavailable.')
})

test('event retrieval remains owner scoped, bounded and allowlists original saved evidence', async () => {
  const listDocuments = jest.fn(async () => ({ documents: [{
    schemaVersion: 2, eventId: 'saved', category: 'news', severity: 'minor',
    detectedAt: '2026-09-01T00:00:00Z', affectedQueries: '[]',
    evidenceJson: JSON.stringify({ baselineMedian: 12, unexpectedPrivateField: 'excluded' }),
  }] }))
  const persistence = new EventPersistence(undefined, {
    databaseId: 'mock-db', equal: (key, value) => `${key}=${value}`,
    orderDesc: key => `desc:${key}`, limit: value => `limit:${value}`,
    databases: { listDocuments, getCollection: jest.fn(), createDocument: jest.fn(), updateDocument: jest.fn() },
  })
  const events = await persistence.getRecent('authenticated-owner', 10)
  expect(listDocuments).toHaveBeenCalledWith('mock-db', expect.any(String),
    ['userId=authenticated-owner', 'desc:detectedAt', 'limit:10'])
  expect(events[0].recordedEvidence?.numbers.baselineMedian).toBe(12)
  expect(JSON.stringify(events[0].recordedEvidence)).not.toContain('excluded')
})
