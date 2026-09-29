/**
 * In-process signal that a user's realtime access may have been withdrawn.
 *
 * Publishers emit only after the revoking write has committed, so a listener
 * that re-checks authorization observes the new state. The signal is local to
 * this process: another server instance learns about the change only through
 * its own bounded authorization cache expiry (see realtimeAuthorizationCache).
 */
export type RealtimeAccessRevocation =
  | { kind: "user"; userId: string }
  | { kind: "all" }

export type RealtimeAccessRevocationListener = (revocation: RealtimeAccessRevocation) => void

export interface RealtimeAccessRevocationSource {
  subscribeRealtimeAccessRevocations(listener: RealtimeAccessRevocationListener): () => void
}

export interface RealtimeAccessRevocationChannel extends RealtimeAccessRevocationSource {
  publish(revocation: RealtimeAccessRevocation): void
}

export function createRealtimeAccessRevocationChannel(): RealtimeAccessRevocationChannel {
  const listeners = new Set<RealtimeAccessRevocationListener>()
  return {
    subscribeRealtimeAccessRevocations(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(revocation) {
      for (const listener of [...listeners]) {
        try {
          listener(revocation)
        } catch {
          // A listener failure must not undo or fail the committed revocation.
        }
      }
    }
  }
}
