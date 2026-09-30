/**
 * How the realtime socket follows the app lifecycle.
 *
 * - foreground: connected; a dead or missing socket reconnects at once.
 * - paused: briefly inactive (Control Centre, notification shade, app
 *   switcher, a system prompt). The socket stays; retries wait.
 * - suspended: in the background. iOS suspends the app, so the socket is
 *   closed at once and the server releases the connection (push
 *   notifications resume) instead of waiting 30-60 s for missed pings.
 */
export type RealtimeAppLifecycle = "foreground" | "paused" | "suspended"

/** Maps a React Native AppState value; unknown values pause retries. */
export function resolveRealtimeAppLifecycle(appState: string): RealtimeAppLifecycle {
  if (appState === "active") return "foreground"
  if (appState === "background") return "suspended"
  return "paused"
}

export interface RealtimeAppLifecycleClient {
  setAppActive(isActive: boolean): void
  suspend(): void
}

export function applyRealtimeAppLifecycle(
  client: RealtimeAppLifecycleClient,
  lifecycle: RealtimeAppLifecycle
): void {
  if (lifecycle === "suspended") client.suspend()
  else client.setAppActive(lifecycle === "foreground")
}
