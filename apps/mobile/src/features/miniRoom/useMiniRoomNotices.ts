import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo } from "react-native"
import type { MiniRoomCopy } from "./miniRoomCopy"
import {
  getMiniRoomNoticeText,
  INITIAL_MINI_ROOM_NOTICE_CURSOR,
  MINI_ROOM_NOTICE_MS,
  resolveMiniRoomNotice
} from "./miniRoomNoticeModel"
import type { useMiniRoomMotion } from "./useMiniRoomMotion"

/**
 * One short notice under the room header (partner here / stepped away / back,
 * seat taken), announced to screen readers. Display only: it never moves an
 * avatar and holds no network state.
 */
export function useMiniRoomNotices(input: {
  roomMotion: ReturnType<typeof useMiniRoomMotion>
  copy: MiniRoomCopy
  partnerFirstName: string
}): string | null {
  const { roomMotion, copy, partnerFirstName } = input
  const joined = roomMotion.enabled && roomMotion.avatars.length > 0
  const partnerPresent = roomMotion.partnerPresent
  const refusalRevision = roomMotion.seatRefusal?.revision
  const localSeatTakenCount = roomMotion.localSeatTakenCount
  const cursorRef = useRef(INITIAL_MINI_ROOM_NOTICE_CURSOR)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const result = resolveMiniRoomNotice(cursorRef.current, { joined, partnerPresent, refusalRevision, localSeatTakenCount })
    cursorRef.current = result.cursor
    if (!result.notice) return
    const text = getMiniRoomNoticeText(result.notice, copy, partnerFirstName)
    setNotice(text)
    AccessibilityInfo.announceForAccessibility(text)
  }, [copy, joined, localSeatTakenCount, partnerFirstName, partnerPresent, refusalRevision])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(current => current === notice ? null : current), MINI_ROOM_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  return notice
}
