import { memo } from "react"
import { ConnectionBanner } from "../features/realtime/connectionBanner/ConnectionBanner"
import { useGlobalRealtime } from "../features/realtime/globalRealtimeProvider"

/**
 * The root connection pill. It subscribes to the connection state itself, so
 * a reconnect re-renders only this banner, never the navigator, the main-tab
 * pages or pushed screens (SYS-3).
 */
export const RootConnectionBanner = memo(function RootConnectionBanner() {
  const { connectionStatus } = useGlobalRealtime()
  return <ConnectionBanner status={connectionStatus} />
})
