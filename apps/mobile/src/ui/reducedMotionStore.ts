export interface ReducedMotionPreference {
  reduceMotion: boolean
  isResolved: boolean
}

export interface ReducedMotionSource {
  isReduceMotionEnabled: () => Promise<boolean>
  addEventListener: (
    event: "reduceMotionChanged",
    listener: (enabled: boolean) => void
  ) => { remove: () => void }
}

export interface ReducedMotionStore {
  getSnapshot: () => ReducedMotionPreference
  subscribe: (listener: () => void) => () => void
}

// Fail closed until the asynchronous OS preference is known so a fresh mount
// never flashes motion for someone who has requested less of it.
const UNRESOLVED: ReducedMotionPreference = Object.freeze({
  reduceMotion: true,
  isResolved: false
})

/**
 * One OS subscription shared by every consumer. Once the preference is
 * resolved, later mounts read it synchronously instead of each starting
 * unresolved and re-rendering when their own query returns.
 */
export function createReducedMotionStore(
  source: ReducedMotionSource
): ReducedMotionStore {
  let snapshot = UNRESOLVED
  const listeners = new Set<() => void>()
  let osSubscription: { remove: () => void } | null = null
  let queryGeneration = 0

  const publish = (next: ReducedMotionPreference) => {
    if (
      next.reduceMotion === snapshot.reduceMotion &&
      next.isResolved === snapshot.isResolved
    ) {
      return
    }
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) listener()
  }

  const start = () => {
    const generation = ++queryGeneration
    osSubscription = source.addEventListener("reduceMotionChanged", (enabled) => {
      publish({ reduceMotion: enabled, isResolved: true })
    })
    void source.isReduceMotionEnabled().then((enabled) => {
      if (generation === queryGeneration && osSubscription) {
        publish({ reduceMotion: enabled, isResolved: true })
      }
    }).catch(() => {
      if (generation === queryGeneration && osSubscription) {
        publish({ reduceMotion: true, isResolved: true })
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
          // Keep the last known value for the next mount; it is refreshed by
          // a new query when a consumer subscribes again.
          queryGeneration += 1
        }
      }
    }
  }
}
