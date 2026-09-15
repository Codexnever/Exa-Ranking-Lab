import { sanitizeRecordedEvidence } from '@/lib/services/algorithm-detector/recorded-evidence'

const missing = 'Not recorded for this event'
const primary = [
  ['currentObservedAverageDrift', 'Current average drift (all observed queries)'],
  ['affectedAverageDrift', 'Affected-query average drift'],
  ['baselineMedian', 'Historical median'],
  ['baselineMedianAbsoluteDeviation', 'Median absolute deviation (MAD)'],
  ['historicalDeviation', 'Robust deviation'],
  ['historicalWindowCount', 'Valid historical windows'],
  ['confidencePercentage', 'Evidence score (0–100)'],
]
const secondary = [
  ['baselineMean', 'Historical mean'], ['baselineStandardDeviation', 'Historical standard deviation'],
  ['historicalObservationCount', 'Historical observations'], ['historicalQueryCount', 'Distinct historical queries'],
  ['historicalWindowDays', 'Recorded lookback (days)'], ['correlationWindowMs', 'Correlation duration (ms)'],
  ['baselineAbsoluteEpsilon', 'Recorded absolute epsilon'], ['baselineDeviationThreshold', 'Recorded deviation threshold'],
  ['driftRateThreshold', 'Recorded coordination threshold (fraction)'],
  ['perQueryDriftThreshold', 'Recorded per-query threshold'], ['minQueriesInCategory', 'Recorded minimum queries'],
  ['confidenceCap', 'Recorded confidence cap'],
]

export function HistoricalBaselineEvidence({ value }: { value: unknown }) {
  const { numbers, text, flags, gates } = sanitizeRecordedEvidence(value)
  const rows = (fields: string[][]) => fields.map(([key, label]) => (
    <div key={key}><dt className='text-muted-foreground'>{label}</dt><dd className='font-medium'>
      {key === 'historicalDeviation' && text.historicalComparisonMethod !== 'robust-mad'
        ? missing : numbers[key] === undefined ? missing : Number(numbers[key].toFixed(3)).toString()}
    </dd></div>
  ))
  return <section aria-label='Historical baseline evidence' className='space-y-3 text-sm'>
    <h3 className='font-semibold'>Historical baseline evidence</h3>
    <p>Detector version: {text.detectorVersion ?? missing}. Detection mode: {text.detectionMode ?? missing}.</p>
    <p>History: {flags.historicalBaselineAvailable === undefined ? missing : flags.historicalBaselineAvailable ? 'Available in the saved baseline' : 'Explicitly unavailable at detection time'}.</p>
    <p>Recorded reason: {text.baselineAvailabilityReason ?? missing}{text.baselineAvailabilityReasonCode ? ` (${text.baselineAvailabilityReasonCode})` : ''}</p>
    <dl className='grid grid-cols-1 sm:grid-cols-2 gap-3'>{rows(primary)}</dl>
    {text.historicalComparisonMethod === 'absolute-epsilon' && <p>
      The saved comparison used the absolute-epsilon rule for zero historical dispersion:
      current average ≥ historical median + recorded epsilon ({numbers.baselineAbsoluteEpsilon ?? missing}).
      A scaled robust deviation is not defined for this comparison.
    </p>}
    {text.historicalComparisonMethod === 'robust-mad' && <p>The saved comparison used robust MAD scaling against the recorded deviation threshold.</p>}
    <p>Confidence capped: {flags.confidenceCapped === undefined ? missing : flags.confidenceCapped ? 'Yes' : 'No'}.
      {' '}Cap reason: {text.confidenceCapReason ?? missing}. The evidence score is not a calibrated probability.</p>
    <details className='rounded border p-3'>
      <summary className='cursor-pointer font-medium'>Recorded settings and evidence details</summary>
      <dl className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3'>{rows(secondary)}</dl>
      <p className='mt-3'>Recorded evaluation window: {text.windowStart ?? missing} → {text.windowEnd ?? missing}.</p>
      <p>Comparison method: {text.historicalComparisonMethod ?? missing}.</p>
      <p>Historical median: the typical category-window drift in the recorded baseline.</p>
      <p>MAD: the median absolute distance of historical window averages from that median.</p>
      <p>Robust deviation: how far current movement is above the median, scaled by historical variation.</p>
      <h4 className='font-medium mt-3'>Recorded detection gates</h4>
      {gates?.length ? <ul className='space-y-2'>{gates.map((gate, index) => <li key={index}>
        {gate.code}: {gate.passed === undefined ? 'Not recorded / unevaluated' : gate.passed ? 'Passed' : 'Did not pass'} — {gate.message}
      </li>)}</ul> : <p>{missing}. Unlisted gates are not assumed to have passed.</p>}
      <p className='mt-3'>No timestamped historical series is saved; these summaries cannot be drawn as a historical chart.</p>
    </details>
  </section>
}
