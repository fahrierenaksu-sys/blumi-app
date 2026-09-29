import type { RealtimeConnectionStatus } from "../features/realtime/realtimeClient"

export type ConnectionBannerState = "hidden" | "offline" | "reconnecting"

export function resolveConnectionBannerState(
  status: RealtimeConnectionStatus,
  isConnected: boolean,
  initialConnectionSlow = false
): ConnectionBannerState {
  if (!isConnected) return "offline"
  // Suppress only the transient first connection. A stuck connection must
  // still become visible after a short grace period.
  if (status === "connecting") return initialConnectionSlow ? "reconnecting" : "hidden"
  if (status === "idle" || status === "connected") return "hidden"
  return "reconnecting"
}
