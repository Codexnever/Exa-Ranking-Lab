/** Recent client-observed operation evidence; not a live database probe. */
export function analyticsHealth(state: {
  dataSource: string; connectionStatus: string; vectorsAvailable: boolean | null;
  lastSuccessfulOperation: number | null;
  operationHistory: Array<{ timestamp: number; success: boolean }>;
}, now = Date.now()) {
  const recent = state.operationHistory.filter(op => now - op.timestamp >= 0 && now - op.timestamp < 600000)
  const successRate = recent.length ? Math.round(recent.filter(op => op.success).length / recent.length * 100) : 0
  if (state.dataSource !== 'weaviate') return { quality: 'not-applicable', isHealthy: false, successRate }
  if (state.connectionStatus === 'error') return { quality: 'poor', isHealthy: false, successRate }
  if (state.lastSuccessfulOperation === null || !Number.isFinite(state.lastSuccessfulOperation) || state.lastSuccessfulOperation > now) return { quality: state.connectionStatus === 'connecting' ? 'connecting' : 'unknown', isHealthy: false, successRate }
  const age = now - state.lastSuccessfulOperation
  if (state.connectionStatus === 'connected' && state.vectorsAvailable && age < 120000 && successRate >= 80)
    return { quality: 'excellent', isHealthy: true, successRate }
  if (state.connectionStatus === 'connected' && age < 300000 && successRate >= 60)
    return { quality: 'good', isHealthy: true, successRate }
  if (age > 600000 || successRate < 40) return { quality: 'poor', isHealthy: false, successRate }
  if (state.connectionStatus === 'connecting') return { quality: 'connecting', isHealthy: false, successRate }
  return { quality: 'unknown', isHealthy: false, successRate }
}
