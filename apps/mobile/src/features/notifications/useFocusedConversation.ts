import { useEffect } from "react"
import { registerFocusedConversation, registerMessageAlertSuppression } from "./foregroundNotificationState"

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

/**
 * While `isFocused`, no message banner is shown: for the shared room (its
 * composer and chat) and the Chats list (each new message moves its row up).
 */
export function useMessageAlertSuppression(isFocused: boolean): void {
  useEffect(() => {
    if (!isFocused) return
    return registerMessageAlertSuppression()
  }, [isFocused])
}
