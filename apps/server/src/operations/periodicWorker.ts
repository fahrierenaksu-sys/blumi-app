/** One bounded cycle at a time; stopping also drains already admitted work. */
export function startPeriodicWorker(options: {
  run(): Promise<unknown>
  intervalMs: number
  reportError?: (error: unknown) => void
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
  run()
  return { async stop() { stopped = true; clearInterval(timer); await pending } }
}
