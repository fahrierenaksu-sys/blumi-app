export interface LatencySummary {
  count: number
  p50: number
  p95: number
  p99: number
  max: number
}

export function summarize(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) return { count: 0, p50: NaN, p95: NaN, p99: NaN, max: NaN }
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (quantile: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))]!
  return {
    count: sorted.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1]!)
  }
}

export function round(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatSummaryTable(rows: Record<string, LatencySummary>): string {
  const header = "metric".padEnd(28) + "count".padStart(8) + "p50".padStart(9) +
    "p95".padStart(9) + "p99".padStart(9) + "max".padStart(9)
  const lines = Object.entries(rows).map(([name, summary]) =>
    name.padEnd(28) + String(summary.count).padStart(8) +
    String(summary.p50).padStart(9) + String(summary.p95).padStart(9) +
    String(summary.p99).padStart(9) + String(summary.max).padStart(9))
  return [header, ...lines].join("\n")
}
