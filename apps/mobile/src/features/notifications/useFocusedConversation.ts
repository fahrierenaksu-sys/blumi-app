import { useEffect } from "react"
import { registerFocusedConversation, registerRoomMessageAlertSuppression } from "./foregroundNotificationState"

/**
 * Marks a conversation as on screen while `isFocused`, so its message and
 * room-invite pushes do not banner over the screen that already shows them.
 */
export function useFocusedConversation(threadId: string | undefined, isFocused: boolean): void {
  useEffect(() => {
    if (!threadId || !isFocused) return
    return registerFocusedConversation(threadId)
  }, [isFocused, threadId])
}

export function useRoomMessageAlertSuppression(isFocused: boolean): void {
  useEffect(() => {
    if (!isFocused) return
    return registerRoomMessageAlertSuppression()
  }, [isFocused])
}
