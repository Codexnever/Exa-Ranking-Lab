"use client"

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/middleware/authentication/auth-context'
import { useSecureApi } from '@/lib/api/use-secureApi'
import type { AlgorithmUpdateEvent } from '@/types/type'
import { sanitizeRecordedEvidence } from '@/lib/services/algorithm-detector/recorded-evidence'
import { HistoricalBaselineEvidence } from './HistoricalBaselineEvidence'
import { DetectorEventRequests } from './detector-event-requests'

const endpoint = '/analytics/algorithm-events?limit=10'
const missing = 'Not recorded for this event'
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : missing

export function normalizeAlgorithmEvents(data: unknown): AlgorithmUpdateEvent[] {
  if (!Array.isArray(data)) return []

  return data.slice(0, 10).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const event = candidate as AlgorithmUpdateEvent

    try {
      const queries: unknown =
        typeof event.affectedQueries === 'string'
          ? JSON.parse(event.affectedQueries)
          : event.affectedQueries ?? []

      if (!Array.isArray(queries)) return []

      return [
        {
          ...event,
          affectedQueries: queries.filter(
            (q) => q && typeof q === 'object' && typeof q.queryId === 'string'
          ),
          recordedEvidence: sanitizeRecordedEvidence(event.recordedEvidence),
        },
      ]
    } catch {
      return []
    }
  })
}

export function AlgorithmUpdatePanel({ active = true }: { active?: boolean }) {
  const { user, initializing } = useAuth()
  const { call } = useSecureApi({ showErrorToast: false })
  const requests = useRef(new DetectorEventRequests<AlgorithmUpdateEvent[]>())
  const [state, setState] = useState<{
    owner?: string
    status: 'loading' | 'success' | 'error'
    events: AlgorithmUpdateEvent[]
  }>({ status: 'loading', events: [] })
  const [refresh, setRefresh] = useState(0)
  const forceNext = useRef(false)
  const userId = user?.$id

  useEffect(() => {
    if (initializing) return
    if (!userId) {
      requests.current.clear()
      return
    }
    if (!active) return

    let cancelled = false
    const force = forceNext.current
    forceNext.current = false
    setState({ owner: userId, status: 'loading', events: [] })

    requests.current
      .load(
        JSON.stringify([userId, endpoint]),
        async () => {
          const data = await call<unknown>('GET', endpoint)
          if (!Array.isArray(data)) throw new Error('Invalid event list')
          return normalizeAlgorithmEvents(data)
        },
        force
      )
      .then((events) => {
        if (!cancelled) setState({ owner: userId, status: 'success', events })
      })
      .catch(() => {
        if (!cancelled) setState({ owner: userId, status: 'error', events: [] })
      })

    return () => {
      cancelled = true
    }
  }, [active, userId, initializing, call, refresh])

  const retry = () => {
    forceNext.current = true
    setRefresh((value) => value + 1)
  }
  const loading = state.owner !== userId || state.status === 'loading'

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle>Ranking-Change Detection</CardTitle>
          {userId && !initializing && (
            <Button variant='outline' size='sm' disabled={loading} onClick={retry}>
              Refresh saved events
            </Button>
          )}
        </div>
        <CardDescription>
          Looks for coordinated ranking movement and compares it with historical category
          behavior when sufficient history is available.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='space-y-2 text-sm'>
          <ul className='list-disc pl-5 space-y-1'>
            <li>Coverage: enough valid queries must be observed.</li>
            <li>Movement: affected queries cross their configured drift threshold.</li>
            <li>Coordination: enough observed queries move together.</li>
            <li>History: current category-wide movement is compared with earlier category windows.</li>
            <li>Limited history: fixed-threshold candidates are unverified and their confidence is capped.</li>
          </ul>
          <p>
            Candidates describe externally observed search behavior, not confirmed internal Exa
            algorithm deployments.
          </p>
          <p>
            <strong>Illustrative example:</strong> A category that normally moves a lot may
            produce no candidate despite high drift. A normally stable category experiencing
            coordinated movement may qualify.
          </p>
          <p>
            Content anomalies are semantically unusual result observations. Drift alerts concern
            individual queries crossing configured drift thresholds. Ranking-change candidates
            concern coordinated category movement assessed by the detector.
          </p>
          <p className='text-muted-foreground'>
            Latest ten saved events for your account. Analytics date, category, and domain filters
            do not apply. Each event retains its own recorded evaluation window. Opening this tab
            only reads saved events.
          </p>
        </div>

        {initializing ? (
          <p role='status'>Checking authentication…</p>
        ) : !userId ? (
          <p>Sign in to view saved ranking-change candidates.</p>
        ) : loading ? (
          <p role='status'>Loading saved ranking-change candidates…</p>
        ) : state.status === 'error' ? (
          <div role='alert'>
            <p>Saved ranking-change candidates could not be loaded.</p>
            <Button onClick={retry} variant='outline'>
              Retry
            </Button>
          </div>
        ) : state.events.length === 0 ? (
          <div>
            <p className='font-medium'>No saved ranking-change candidates found.</p>
            <p>
              This does not establish that detection ran or rankings were stable. Scheduled
              processing can save candidates; suppressed candidates are not stored.
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {state.events.map((event, index) => (
              <details key={event.id ?? index} className='border rounded-lg p-4'>
                <summary className='cursor-pointer space-y-1'>
                  <span className='font-semibold'>{event.category || 'Unknown category'}</span>
                  {' · '}
                  {event.severity}
                  <span className='block text-sm'>
                    {Number.isFinite(new Date(event.detectedAt).getTime())
                      ? new Date(event.detectedAt).toLocaleString()
                      : missing}
                  </span>
                  <span className='block text-sm'>
                    Drift rate:{' '}
                    {typeof event.recordedEvidence?.numbers.driftRate === 'number'
                      ? number(event.recordedEvidence.numbers.driftRate * 100) + '%'
                      : missing}{' '}
                    · {event.affectedQueries.length} affected queries · Average drift score
                    (legacy field): {number(event.recordedEvidence?.numbers.avgDriftScore)}
                  </span>
                </summary>
                <div className='space-y-4 pt-4'>
                  <p className='text-sm'>{event.description ?? event.detail ?? missing}</p>
                  <HistoricalBaselineEvidence value={event.recordedEvidence} />
                  <h3 className='font-semibold'>Affected queries</h3>
                  <ul className='text-sm space-y-1'>
                    {event.affectedQueries.map((query, i) => (
                      <li key={i}>
                        {query.queryName || query.queryId}: {number(query.driftScore)}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}