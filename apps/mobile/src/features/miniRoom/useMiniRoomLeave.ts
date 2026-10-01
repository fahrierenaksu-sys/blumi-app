import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import { leaveRoomSession, RoomSessionLeaveError } from "../chat/chatRoomInviteApi"
import type { MiniRoomCopy } from "./miniRoomCopy"
import { startMiniRoomLeave } from "./miniRoomLeaveFlow"

/**
 * The confirmed "Leave room" action. Leaving ends the room for both people
 * (the server sends `mini_room.ended` to the partner), and it never keeps the
 * person in the room: a slow, failed or refused close still exits, and the
 * close is confirmed in the background (startMiniRoomLeave).
 */
export function useMiniRoomLeave(input: {
  miniRoomId: string
  sessionMode: string
  sessionToken: string
  copy: MiniRoomCopy
  exitedRef: RefObject<boolean>
  exitRoom: () => void
}): { leaveRequested: boolean; requestLeave: () => void } {
  const { miniRoomId, sessionMode, copy, exitedRef, exitRoom } = input
  const [leaveRequested, setLeaveRequested] = useState(false)
  const requestedRef = useRef(false)
  const mountedRef = useRef(true)
  // Background retries keep using the newest token this screen saw.
  const sessionTokenRef = useRef(input.sessionToken)
  sessionTokenRef.current = input.sessionToken

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const requestLeave = useCallback((): void => {
    if (exitedRef.current || requestedRef.current) return
    requestedRef.current = true
    setLeaveRequested(true)
    if (sessionMode !== "production") {
      exitRoom()
      return
    }
    void startMiniRoomLeave({
      attempt: () => leaveRoomSession(MOBILE_HTTP_BASE_URL, sessionTokenRef.current, miniRoomId),
      readFailureStatus: (error) => error instanceof RoomSessionLeaveError ? error.status : null,
      // A screen already removed some other way (sign-out, a reset) stays removed.
      exit: () => { if (mountedRef.current) exitRoom() },
      onUnconfirmed: () => showToast({ type: "info", title: copy.leftRoomUnconfirmed })
    })
  }, [copy, exitRoom, exitedRef, miniRoomId, sessionMode])

  return { leaveRequested, requestLeave }
}
