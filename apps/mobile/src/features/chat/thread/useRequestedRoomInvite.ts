import { useEffect, useEffectEvent, useRef } from "react"

/**
 * "Invite to room" pressed on the partner's profile returns to this chat with
 * a one-shot `roomInviteRequest` route param. Once the chat is focused, the
 * request runs the chat's own invite action exactly once (the same path as
 * the composer's invite button) and the param is cleared.
 */
export function useRequestedRoomInvite(input: {
  request: string | undefined
  isFocused: boolean
  onInvite: () => void
  clearRequest: () => void
}): void {
  const { request, isFocused } = input
  const handledRequestRef = useRef<string | null>(null)
  const runRequest = useEffectEvent(() => {
    input.clearRequest()
    input.onInvite()
  })

  useEffect(() => {
    if (!request || !isFocused || handledRequestRef.current === request) return
    handledRequestRef.current = request
    runRequest()
  }, [isFocused, request])
}
