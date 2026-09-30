import type { RealtimeConnectionStatus } from "@blumi/realtime-client"

export type ConnectionBannerState = "hidden" | "offline" | "reconnecting" | "unreachable"

/**
 * A connection problem is shown only once it has lasted this long in the
 * foreground. A resume reconnect (fresh ticket plus WebSocket handshake)
 * normally finishes well inside it, so the user never sees a flash.
 */
export const CONNECTION_BANNER_GRACE_MS = 3_000

/** The connection problem right now, before any grace period. */
export function resolveConnectionIssue(
  status: RealtimeConnectionStatus,
  isConnected: boolean
): ConnectionBannerState {
  if (!isConnected) return "offline"
  if (status === "idle" || status === "connected") return "hidden"
  // The fast attempts are exhausted and retries continue slowly: do not
  // promise an imminent reconnect.
  if (status === "unreachable") return "unreachable"
  return "reconnecting"
}

export interface ConnectionBannerSignal {
  status: RealtimeConnectionStatus
  isConnected: boolean
  appActive: boolean
}

export interface ConnectionBannerGateOptions {
  graceMs?: number
  /** Schedules one callback; returns its cancel function. */
  schedule: (callback: () => void, delayMs: number) => () => void
  /** Receives each change of the visible state. */
  onChange: (state: ConnectionBannerState) => void
}

export interface ConnectionBannerGate {
  update(signal: ConnectionBannerSignal): void
  dispose(): void
}

/**
 * Decides what the banner shows. A problem becomes visible only after it has
 * lasted `graceMs` while the app is in the foreground; the clock starts again
 * on every return to the foreground, so the reconnect that follows a resume
 * stays invisible. Changing the kind of problem mid-outage keeps the clock,
 * and recovery hides the banner at once. Nothing shows in the background, so
 * the app-switcher snapshot stays clean.
 */
export function createConnectionBannerGate(
  options: ConnectionBannerGateOptions
): ConnectionBannerGate {
  const graceMs = options.graceMs ?? CONNECTION_BANNER_GRACE_MS
  let issue: ConnectionBannerState = "hidden"
  let outageActive = false
  let revealed = false
  let visible: ConnectionBannerState = "hidden"
  let cancelReveal: (() => void) | null = null

  const publish = (): void => {
    const next = revealed ? issue : "hidden"
    if (next === visible) return
    visible = next
    options.onChange(next)
  }

  const stopReveal = (): void => {
    cancelReveal?.()
    cancelReveal = null
  }

  return {
    update(signal) {
      issue = resolveConnectionIssue(signal.status, signal.isConnected)
      const tracking = signal.appActive && issue !== "hidden"
      if (!tracking) {
        stopReveal()
        outageActive = false
        revealed = false
      } else if (!outageActive) {
        outageActive = true
        revealed = false
        stopReveal()
        cancelReveal = options.schedule(() => {
          cancelReveal = null
          revealed = true
          publish()
        }, graceMs)
      }
      publish()
    },
    dispose() {
      // A later update (React re-running effects) starts a fresh grace period.
      stopReveal()
      outageActive = false
    }
  }
}
