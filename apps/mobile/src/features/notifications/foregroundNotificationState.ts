import { getActiveChatThreadId } from "../chat/chatStore"
import { claimVisibleIncomingMessage, createForegroundAlertLedger } from "./notificationPresentationModel"

/**
 * Process-wide foreground notification state: which conversations are on
 * screen (the chat thread registers through chatStore and here; the shared
 * room registers here), which surfaces already show every message (the
 * shared room and the Chats list), and which events were already presented.
 * Reset on account change so one account's alerts never affect another's.
 */
const alertLedger = createForegroundAlertLedger()
const focusedConversationCounts = new Map<string, number>()
const messageAlertSuppressions = new Set<symbol>()
const conversationFocusListeners = new Set<(threadId: string) => void>()

/**
 * While registered, no message banner is shown: the shared room protects its
 * composer even while its canonical thread is loading, and the Chats list
 * already shows each new message in its row.
 */
export function registerMessageAlertSuppression(): () => void {
  const owner = Symbol()
  messageAlertSuppressions.add(owner)
  return () => { messageAlertSuppressions.delete(owner) }
}

export function areMessageAlertsSuppressed(): boolean {
  return messageAlertSuppressions.size > 0
}

export function registerFocusedConversation(threadId: string): () => void {
  focusedConversationCounts.set(threadId, (focusedConversationCounts.get(threadId) ?? 0) + 1)
  for (const listener of [...conversationFocusListeners]) {
    try { listener(threadId) } catch { /* A cleanup hint must not break focus. */ }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (focusedConversationCounts.get(threadId) ?? 1) - 1
    if (remaining > 0) focusedConversationCounts.set(threadId, remaining)
    else focusedConversationCounts.delete(threadId)
  }
}

/** Called each time a conversation comes on screen (for example to clear its delivered banners). */
export function subscribeToConversationFocus(listener: (threadId: string) => void): () => void {
  conversationFocusListeners.add(listener)
  return () => { conversationFocusListeners.delete(listener) }
}

export function isConversationFocused(threadId: string): boolean {
  return getActiveChatThreadId() === threadId || focusedConversationCounts.has(threadId)
}

/** True when no surface presented this event recently; records the claim. */
export function claimForegroundAlert(key: string): boolean {
  return alertLedger.claim(key)
}

/**
 * A partner message arrived over the socket. If it is already visible, its
 * alert is claimed so a late push for it stays quiet; otherwise the push
 * banner remains its only alert (there is no in-app message toast).
 */
export function noteIncomingMessage(message: { threadId: string; messageId: string }): void {
  claimVisibleIncomingMessage(
    message,
    (threadId) => areMessageAlertsSuppressed() || isConversationFocused(threadId),
    claimForegroundAlert
  )
}

export function resetForegroundNotificationAlerts(): void {
  alertLedger.reset()
}
