/**
 * Runs at most one flush per key. A request that arrives while a flush runs
 * is not dropped: one trailing flush runs after it with the latest input, and
 * every request made meanwhile resolves with that trailing result. Without
 * it a reconnect landing mid-flush (for example a flush started while the app
 * was resuming and the network was not ready) left the queue undelivered
 * until the next connection change. Items leave the outbox only after
 * delivery, so a trailing flush never sends one twice.
 */
export function createCoalescedFlush<Input, Result>(
  run: (input: Input) => Promise<Result>
): (key: string, input: Input) => Promise<Result> {
  const active = new Map<string, Promise<Result>>()
  const trailing = new Map<string, { input: Input; promise: Promise<Result> }>()

  const start = (key: string, input: Input): Promise<Result> => {
    const flush = run(input)
    active.set(key, flush)
    const release = (): void => {
      if (active.get(key) === flush) active.delete(key)
    }
    void flush.then(release, release)
    return flush
  }

  return (key, input) => {
    const queued = trailing.get(key)
    if (queued) {
      queued.input = input
      return queued.promise
    }
    const current = active.get(key)
    if (!current) return start(key, input)
    const entry = { input, promise: current as Promise<Result> }
    const ignore = (): void => undefined
    entry.promise = current.then(ignore, ignore).then(() => {
      trailing.delete(key)
      return start(key, entry.input)
    })
    trailing.set(key, entry)
    return entry.promise
  }
}
