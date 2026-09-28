export interface InventoryHydrationFlight<Result> {
  token: string
  promise: Promise<Result>
}

/** Coalesce only simultaneous requests for one session; never cache a response. */
export function runInventoryHydrationSingleFlight<Result>(
  slot: { current: InventoryHydrationFlight<Result> | null },
  token: string,
  start: () => Promise<Result>
): Promise<Result> {
  if (slot.current?.token === token) return slot.current.promise

  const promise = Promise.resolve().then(start)
  slot.current = { token, promise }
  const clear = () => {
    if (slot.current?.promise === promise) slot.current = null
  }
  void promise.then(clear, clear)
  return promise
}
