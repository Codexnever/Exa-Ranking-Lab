/**
 * Converts a time range in milliseconds or a time range string to a Weaviate-compatible string key (e.g., '7d', '30d', '90d', '1y').
 * - Accepts either ms (number) or a common string key.
 * - Returns '7d', '30d', '90d', '1y', or '30d' as fallback.
 */
export function getTimeRangeString(timeRange: number | string): '7d' | '30d' | '90d' | '1y' {
  // If it's already a known valid string, return directly
  if (typeof timeRange === 'string') {
    if (['7d', '30d', '90d', '1y'].includes(timeRange)) return timeRange as '7d' | '30d' | '90d' | '1y';
    // Legacy or unsupported strings: try to parse  (e.g. "365d", "1year")
    if (timeRange === '365d' || timeRange === '1year' || timeRange === '12m') return '1y';
    if (timeRange === '14d') return '7d';
    if (timeRange === '60d') return '30d';
    // Fallback for any unknown string
    return '30d';
  }
  // If it's a number, treat as ms and map by days
  if (typeof timeRange === 'number') {
    const days = Math.round(timeRange / (24 * 60 * 60 * 1000));
    if (days <= 7) return '7d';
    if (days <= 30) return '30d';
    if (days <= 90) return '90d';
    if (days <= 366) return '1y';
    // Fallback/default
    return '30d';
  }
  // Safety fallback
  return '30d';
}
