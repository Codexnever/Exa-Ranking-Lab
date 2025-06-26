export function formatResponseTime(value: number | undefined): string {
  if (typeof value !== 'number' || isNaN(value)) return '-';

  const seconds = value / 1000;

  if (seconds >= 10) {
    // >= 10s: no decimals
    return `${Math.round(seconds)}s`;
  } else if (seconds >= 1) {
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
