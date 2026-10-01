import { useTotalUnreadCount } from "../features/chat/chatStore"
import { isDemoMode, useDemoStore } from "../features/demo/demoStore"

/**
 * The Chats tab badge: unread messages, plus the demo matches in demo mode.
 * The bottom bar reads it itself, so an unread change re-renders only the
 * bar, never the root navigator, its pages or pushed screens (SYS-3).
 */
export function useMainTabChatBadgeCount(): number {
  const totalUnreadCount = useTotalUnreadCount()
  const demoStore = useDemoStore()
  return totalUnreadCount + (isDemoMode() ? demoStore.matchedProfiles.length : 0)
}
