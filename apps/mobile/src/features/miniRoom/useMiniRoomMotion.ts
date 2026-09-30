import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { getGlobalStatus, sendGlobal, subscribeToEvents, subscribeToStatus } from "../realtime/globalRealtimeProvider"
import { createMiniRoomMotionSession, type MiniRoomMotionState } from "./miniRoomMotionSession"

export function useMiniRoomMotion(input: {
  miniRoomId: string; localUserId: string; partnerUserId: string; enabled: boolean; isFocused: boolean
}) {
  const [state, setState] = useState<MiniRoomMotionState>({ avatars: [], snap: false, partnerPresent: false })
  const sessionRef = useRef<ReturnType<typeof createMiniRoomMotionSession> | null>(null)
  const { miniRoomId, localUserId, partnerUserId, enabled, isFocused } = input
  useEffect(() => {
    setState({ avatars: [], snap: false, partnerPresent: false })
    if (!enabled || !isFocused) return
    const session = createMiniRoomMotionSession({ miniRoomId, localUserId, partnerUserId,
      send: sendGlobal, update: setState })
    sessionRef.current = session
    let joined = false
    const sync = () => {
      const visible = getGlobalStatus() === "connected" && AppState.currentState === "active"
      if (visible && !joined) { joined = true; session.connect() }
      else if (!visible && joined) { joined = false; session.leave() }
    }
    const unsubscribeEvents = subscribeToEvents(event => { if (joined) session.receive(event) })
    const unsubscribeStatus = subscribeToStatus(sync)
    const subscription = AppState.addEventListener("change", sync)
    sync()
    return () => {
      unsubscribeEvents(); unsubscribeStatus(); subscription.remove()
      session.leave(); sessionRef.current = null
    }
  }, [enabled, isFocused, localUserId, miniRoomId, partnerUserId])
  const onLocalMove = useCallback((point: { x: number; y: number }, hotspotId?: string) =>
    !enabled || (sessionRef.current?.move(point, hotspotId) ?? false), [enabled])
  return { ...state, onLocalMove, enabled }
}
