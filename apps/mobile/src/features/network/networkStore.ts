import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"
import { useSyncExternalStore } from "react"

type NetworkListener = (isConnected: boolean) => void

let currentlyConnected = true
let stopMonitoring: (() => void) | null = null
const listeners = new Set<NetworkListener>()

function readConnection(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false
}

function ensureMonitoring(): void {
  if (stopMonitoring) return
  stopMonitoring = NetInfo.addEventListener((state) => {
    const nextConnected = readConnection(state)
    if (nextConnected === currentlyConnected) return
    currentlyConnected = nextConnected
    for (const listener of listeners) listener(nextConnected)
  })
}

export function subscribeToNetworkStatus(listener: NetworkListener): () => void {
  ensureMonitoring()
  listeners.add(listener)
  listener(currentlyConnected)
  return () => {
    listeners.delete(listener)
  }
}

export function useNetworkStatus(): { isConnected: boolean } {
  const isConnected = useSyncExternalStore(
    (notify) => subscribeToNetworkStatus(() => notify()),
    getIsConnected,
    getIsConnected
  )
  return { isConnected }
}

export function getIsConnected(): boolean {
  ensureMonitoring()
  return currentlyConnected
}
