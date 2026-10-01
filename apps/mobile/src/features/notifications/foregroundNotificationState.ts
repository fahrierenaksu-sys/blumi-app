import { getActiveChatThreadId } from "../chat/chatStore"
import { createForegroundAlertLedger, shouldShowInAppMessageAlert } from "./notificationPresentationModel"

/**
 * Process-wide foreground notification state: which conversations are on
 * screen (the chat thread registers through chatStore; the shared room
 * registers here) and which events an in-app surface already presented.
 * Reset on account change so one account's alerts never affect another's.
 */
const alertLedger = createForegroundAlertLedger()
const focusedConversationCounts = new Map<string, number>()
const roomMessageAlertSuppressions = new Set<symbol>()

/** A room protects its composer even while its canonical thread is loading. */
export function registerRoomMessageAlertSuppression(): () => void {
  const owner = Symbol()
  roomMessageAlertSuppressions.add(owner)
  return () => { roomMessageAlertSuppressions.delete(owner) }
}

export function areRoomMessageAlertsSuppressed(): boolean {
  return roomMessageAlertSuppressions.size > 0
}

export function registerFocusedConversation(threadId: string): () => void {
  focusedConversationCounts.set(threadId, (focusedConversationCounts.get(threadId) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (focusedConversationCounts.get(threadId) ?? 1) - 1
    if (remaining > 0) focusedConversationCounts.set(threadId, remaining)
    else focusedConversationCounts.delete(threadId)
  }
}

export function isConversationFocused(threadId: string): boolean {
  return getActiveChatThreadId() === threadId || focusedConversationCounts.has(threadId)
}

/** True when no surface presented this event recently; records the claim. */
export function claimForegroundAlert(key: string): boolean {
  return alertLedger.claim(key)
}

/** Gate for the in-app toast of a message received over the socket. */
export function shouldShowIncomingMessageAlert(message: { threadId: string; messageId: string }): boolean {
  if (areRoomMessageAlertsSuppressed()) {
    claimForegroundAlert(`message:${message.messageId}`)
    return false
  }
  return shouldShowInAppMessageAlert(message, isConversationFocused, claimForegroundAlert)
}

export function resetForegroundNotificationAlerts(): void {
  alertLedger.reset()
}
