export interface ReduceTransparencyPreference {
  reduceTransparency: boolean
  isResolved: boolean
}

export interface ReduceTransparencySource {
  isReduceTransparencyEnabled: () => Promise<boolean>
  addEventListener: (
    event: "reduceTransparencyChanged",
    listener: (enabled: boolean) => void
  ) => { remove: () => void }
}

export interface ReduceTransparencyStore {
  getSnapshot: () => ReduceTransparencyPreference
  subscribe: (listener: () => void) => () => void
}

// Fail closed until the asynchronous OS preference is known: surfaces stay
// opaque. `isResolved` lets a consumer tell this default from a real answer.
const UNRESOLVED: ReduceTransparencyPreference = Object.freeze({
  reduceTransparency: true,
  isResolved: false
})

/**
 * One OS subscription shared by every glass surface. Fails closed: surfaces
 * stay opaque until the OS preference is known or if it cannot be read. Once
 * resolved, later mounts read the value synchronously on their first frame.
 */
export function createReduceTransparencyStore(
  source: ReduceTransparencySource
): ReduceTransparencyStore {
  let snapshot = UNRESOLVED
  const listeners = new Set<() => void>()
  let osSubscription: { remove: () => void } | null = null
  let generation = 0

  const publish = (next: ReduceTransparencyPreference) => {
    if (
      next.reduceTransparency === snapshot.reduceTransparency &&
      next.isResolved === snapshot.isResolved
    ) {
      return
    }
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) listener()
  }

  const start = () => {
    const current = ++generation
    osSubscription = source.addEventListener("reduceTransparencyChanged", (enabled) => {
      generation += 1 // A live OS change is newer than the initial query.
      publish({ reduceTransparency: enabled, isResolved: true })
    })
    source.isReduceTransparencyEnabled().then((enabled) => {
      if (current === generation && osSubscription) {
        publish({ reduceTransparency: enabled, isResolved: true })
      }
    }).catch(() => {
      if (current === generation && osSubscription) {
        publish({ reduceTransparency: true, isResolved: true })
      }
    })
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (!osSubscription) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && osSubscription) {
          osSubscription.remove()
          osSubscription = null
          // Keep the last known value for the next mount; a new query
          // refreshes it when a consumer subscribes again.
          generation += 1
        }
      }
    }
  }
}
