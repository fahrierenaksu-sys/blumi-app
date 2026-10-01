import { useEffect } from "react"
import { registerFocusedConversation } from "./foregroundNotificationState"

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
