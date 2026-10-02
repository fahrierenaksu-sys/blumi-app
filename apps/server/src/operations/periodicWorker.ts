/**
 * A random first-run delay below min(intervalMs, 30 s). Maintenance workers
 * use it so a cold start does not open a connection per worker at once
 * (2026-10-02: each deploy overlap exhausted the 15-slot session pooler).
 */
export function startupJitterMs(intervalMs: number, random: () => number = Math.random): number {
  return Math.floor(random() * Math.min(intervalMs, 30_000))
}

/** One bounded cycle at a time; stopping also drains already admitted work. */
export function startPeriodicWorker(options: {
  run(): Promise<unknown>
  intervalMs: number
  reportError?: (error: unknown) => void
  /** Delay before the first cycle; omitted, it runs at once. */
  firstRunDelayMs?: number
}): { stop(): Promise<void> } {
  let stopped = false
  let pending: Promise<void> | undefined
  const run = () => {
    if (stopped || pending) return
    pending = Promise.resolve().then(options.run).then(() => {}, (error) => {
      options.reportError?.(error)
    }).finally(() => { pending = undefined })
  }
  const timer = setInterval(run, options.intervalMs)
  timer.unref()
  const firstRun = options.firstRunDelayMs && options.firstRunDelayMs > 0
    ? setTimeout(run, options.firstRunDelayMs)
    : undefined
  firstRun?.unref()
  if (!firstRun) run()
  return { async stop() { stopped = true; clearInterval(timer); if (firstRun) clearTimeout(firstRun); await pending } }
}
