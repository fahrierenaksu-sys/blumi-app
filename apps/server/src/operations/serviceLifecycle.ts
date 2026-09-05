export function createGracefulShutdown(options: {
  markNotReady(): void
  drain: readonly (() => Promise<void>)[]
  drainOutgoing?(): Promise<void>
  closeData(): Promise<void>
  timeoutMs?: number
}): () => Promise<void> {
  let shutdown: Promise<void> | undefined
  return () => {
    if (shutdown) return shutdown
    options.markNotReady()
    shutdown = withDeadline((async () => {
      const results = await Promise.allSettled(options.drain.map((drain) => Promise.resolve().then(drain)))
      const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : [])
      try { await options.drainOutgoing?.() } catch (error) { errors.push(error) }
      try { await options.closeData() } catch (error) { errors.push(error) }
      if (errors.length) throw new AggregateError(errors, "Service shutdown failed")
    })(), options.timeoutMs ?? 30_000, "Service shutdown timed out")
    return shutdown
  }
}

export function createReadinessProbe(options: {
  isAccepting(): boolean
  check(): Promise<void>
  timeoutMs?: number
}): () => Promise<boolean> {
  let pending: Promise<void> | undefined
  return async () => {
    if (!options.isAccepting()) return false
    // A stalled database query must not create an unlimited probe backlog.
    pending ??= Promise.resolve().then(options.check).finally(() => { pending = undefined })
    try {
      await withDeadline(pending, options.timeoutMs ?? 2_000, "Readiness timed out")
      return options.isAccepting()
    } catch {
      return false
    }
  }
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
