export function formatResponseTime(value: number | undefined): string {
  if (typeof value !== 'number' || isNaN(value)) return '-';

  const seconds = value / 1000;

  if (seconds >= 60) {
    // >= 1 minute
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  } else if (seconds >= 10) {
    // 10s – 59.9s: no decimals
    return `${Math.round(seconds)}s`;
  } else if (seconds >= 1) {
    // 1s – 9.99s: show 2 decimals
    return `${seconds.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}s`;
  } else if (value > 0) {
    // < 1s: show ms
    return `${Math.round(value)}ms`;
  } else {
    return '-';
  }
}
