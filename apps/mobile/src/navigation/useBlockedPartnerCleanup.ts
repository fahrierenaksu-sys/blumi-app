import { StackActions } from "@react-navigation/native"
import { useCallback, useEffect } from "react"
import { removeChatThreadsWithPartner } from "../features/chat/chatStore"
import { subscribeToPartnerBlocked } from "../features/safety/partnerBlockedEvents"
import { applyBlockedPartnerToChat, type BlockedPartnerNavigation } from "./blockedPartnerChatExit"
import { navigationRef } from "./rootNavigationRef"
import { getRootRouteBeneathSheets, popRootRouteBeneathSheets } from "./nativeSheets/rootRouteBeneathSheets"

const rootBlockedPartnerNavigation: BlockedPartnerNavigation = {
  // A report sheet may sit over the chat: read and leave the chat beneath it.
  getCurrentRoute: () => getRootRouteBeneathSheets(),
  canGoBack: () => navigationRef.canGoBack(),
  goBack: () => popRootRouteBeneathSheets(),
  replaceWithInbox: () => navigationRef.dispatch(StackActions.replace("Inbox"))
}

/** Drops the blocked partner's threads and leaves their open conversation. */
export function applyBlockedPartner(blockedUserId: string): void {
  applyBlockedPartnerToChat({
    blockedUserId,
    removeThreadsWithPartner: removeChatThreadsWithPartner,
    navigation: navigationRef.isReady() ? rootBlockedPartnerNavigation : null
  })
}

/**
 * Applies every successful block by the signed-in user (report sheet,
 * block-only action, demo report) to chat at once. Returns the handler for
 * the server's `safety.user_blocked` confirmation, which does the same.
 */
export function useBlockedPartnerCleanup(currentUserId: string | undefined): (blockedUserId: string) => void {
  useEffect(() => {
    if (!currentUserId) return
    return subscribeToPartnerBlocked((event) => {
      if (event.ownerUserId !== currentUserId) return
      applyBlockedPartner(event.blockedUserId)
    })
  }, [currentUserId])

  return useCallback((blockedUserId: string): void => {
    if (!currentUserId) return
    applyBlockedPartner(blockedUserId)
  }, [currentUserId])
}
