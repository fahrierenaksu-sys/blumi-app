import { useCallback, useEffect, useRef, useState } from "react"

export interface MiniRoomScrollToLatest {
  /** Changes whenever the transcript should jump to its newest message. */
  request: number
  /** The history toggle: go to the newest message now. */
  requestScrollToLatest: () => void
  /** An accepted send: the person's own message is shown once the keyboard is down. */
  noteMessageSent: () => void
}

/**
 * The transcript follows new messages on its own only within a few points
 * of the newest one (MiniRoomChatHistory). A message sent while typing lands
 * while the transcript is hidden behind the keyboard, so closing the
 * keyboard after a send, by any means, jumps to the newest message, as the
 * history toggle does.
 */
export function useMiniRoomScrollToLatest(keyboardVisible: boolean): MiniRoomScrollToLatest {
  const [request, setRequest] = useState(0)
  const sentWhileTypingRef = useRef(false)
  const requestScrollToLatest = useCallback(() => {
    sentWhileTypingRef.current = false
    setRequest((current) => current + 1)
  }, [])
  const noteMessageSent = useCallback(() => {
    if (keyboardVisible) {
      sentWhileTypingRef.current = true
      return
    }
    requestScrollToLatest()
  }, [keyboardVisible, requestScrollToLatest])
  useEffect(() => {
    if (keyboardVisible || !sentWhileTypingRef.current) return
    requestScrollToLatest()
  }, [keyboardVisible, requestScrollToLatest])
  return { request, requestScrollToLatest, noteMessageSent }
}
