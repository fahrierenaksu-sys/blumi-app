import { useEffect } from "react"
import { AppState } from "react-native"
import * as Updates from "expo-updates"
import { resolveOtaUpdateMode, shouldCheckForOtaUpdate } from "./otaUpdatePolicy"

/**
 * In the development build (channel `preview`) check for an OTA update every
 * time the app returns to the foreground and reload into it at once. The
 * stable build keeps expo-updates' default launch behaviour. expo-updates only
 * offers updates whose runtime version matches this binary, so an update
 * built for different native code is never applied.
 */
export function useOtaUpdates(): void {
  useEffect(() => {
    const mode = resolveOtaUpdateMode({
      isEnabled: Updates.isEnabled,
      channel: Updates.channel,
      isDevelopmentRuntime: __DEV__
    })
    if (mode !== "apply-on-foreground") return undefined

    let inFlight = false
    let lastCheckedAt: number | null = null
    let disposed = false

    const checkAndApply = async (): Promise<void> => {
      const now = Date.now()
      if (!shouldCheckForOtaUpdate({ inFlight, lastCheckedAt, now })) return
      inFlight = true
      lastCheckedAt = now
      try {
        const result = await Updates.checkForUpdateAsync()
        if (disposed || !result.isAvailable) return
        await Updates.fetchUpdateAsync()
        if (!disposed) await Updates.reloadAsync()
      } catch {
        // Offline or the update server is unreachable: keep running the
        // current bundle and try again on the next foreground.
      } finally {
        inFlight = false
      }
    }

    void checkAndApply()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkAndApply()
    })
    return () => {
      disposed = true
      subscription.remove()
    }
  }, [])
}
