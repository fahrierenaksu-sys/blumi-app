import type { RealtimeConnectionStatus } from "./realtimeClient"

/**
 * Emits once for each connected edge that follows an established connection
 * dropping, while ignoring the first connection observed by a subscriber.
 */
export function createReconnectTransitionTracker(
  initialStatus: RealtimeConnectionStatus
): (status: RealtimeConnectionStatus) => boolean {
  let hasSeenConnected = initialStatus === "connected"
  let reconnectPending = false

  return (status): boolean => {
    if (status === "connected") {
      if (!hasSeenConnected) {
        hasSeenConnected = true
        reconnectPending = false
        return false
      }
      if (!reconnectPending) return false
      reconnectPending = false
      return true
    }

    if (hasSeenConnected) reconnectPending = true
    return false
  }
}
