/** The part of the focused route this decision reads. */
export interface FocusedRouteSnapshot {
  name: string
  params?: object
}

export interface BlockedPartnerNavigation {
  getCurrentRoute: () => FocusedRouteSnapshot | undefined
  canGoBack: () => boolean
  goBack: () => void
  /** Used when the chat is the only screen in the stack. */
  replaceWithInbox: () => void
}

/**
 * True when the focused screen is a conversation with the blocked partner:
 * a thread that was just removed, or a pending chat opened for that partner.
 */
export function isChatWithBlockedPartner(
  route: FocusedRouteSnapshot | undefined,
  blockedUserId: string,
  removedThreadIds: readonly string[]
): boolean {
  if (route?.name !== "ChatThread") return false
  const params = (route.params ?? {}) as { threadId?: unknown; partnerId?: unknown }
  if (params.partnerId === blockedUserId) return true
  return typeof params.threadId === "string" && removedThreadIds.includes(params.threadId)
}

/**
 * Applies a confirmed block to chat: drops the partner's threads and, when
 * their conversation is open, leaves it the way the back button does.
 * Idempotent, so a local block followed by the realtime confirmation is safe.
 */
export function applyBlockedPartnerToChat(input: {
  blockedUserId: string
  removeThreadsWithPartner: (partnerUserId: string) => string[]
  navigation: BlockedPartnerNavigation | null
}): { removedThreadIds: string[]; leftChat: boolean } {
  const removedThreadIds = input.removeThreadsWithPartner(input.blockedUserId)
  const navigation = input.navigation
  if (!navigation || !isChatWithBlockedPartner(navigation.getCurrentRoute(), input.blockedUserId, removedThreadIds)) {
    return { removedThreadIds, leftChat: false }
  }
  if (navigation.canGoBack()) navigation.goBack()
  else navigation.replaceWithInbox()
  return { removedThreadIds, leftChat: true }
}
