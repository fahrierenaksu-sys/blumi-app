import { useEffect } from "react"
import { showConversationInRoom } from "../chat/chatStore"

/**
 * While the MiniRoom is focused its conversation's messages appear as speech
 * bubbles, so neither an in-app toast nor a foreground push repeats them.
 */
export function useRoomConversationOnScreen(threadId: string | undefined, isFocused: boolean): void {
  useEffect(() => {
    if (!threadId || !isFocused) return
    return showConversationInRoom(threadId)
  }, [isFocused, threadId])
}
