import { useEffect, useState, useSyncExternalStore } from "react"
import { AppState } from "react-native"
import type { RealtimeConnectionStatus } from "@blumi/realtime-client"
import { useNetworkStatus } from "../../network/networkStore"
import {
  createConnectionBannerGate,
  type ConnectionBannerState
} from "./connectionBannerModel"

function subscribeToAppState(notify: () => void): () => void {
  const subscription = AppState.addEventListener("change", notify)
  return () => subscription.remove()
}

/** Unknown launch states count as foreground so a real outage still shows. */
function readAppIsForeground(): boolean {
  const state = AppState.currentState as string | null
  return state !== "background" && state !== "inactive"
}

function scheduleReveal(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

/**
 * The banner state after the foreground grace period: short reconnects,
 * including the one after every return from the background, stay invisible.
 */
export function useConnectionBannerState(
  status: RealtimeConnectionStatus
): ConnectionBannerState {
  const { isConnected } = useNetworkStatus()
  const appActive = useSyncExternalStore(subscribeToAppState, readAppIsForeground, readAppIsForeground)
  const [state, setState] = useState<ConnectionBannerState>("hidden")
  const [gate] = useState(() => createConnectionBannerGate({
    schedule: scheduleReveal,
    onChange: setState
  }))

  useEffect(() => {
    gate.update({ status, isConnected, appActive })
  }, [appActive, gate, isConnected, status])

  useEffect(() => () => gate.dispose(), [gate])

  return state
}
