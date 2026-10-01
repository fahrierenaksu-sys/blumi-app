import { useEffect, useRef, useSyncExternalStore } from "react"
import { AccessibilityInfo } from "react-native"
import { isPartnerTyping, shouldAnnounceTyping } from "./chatTypingModel"
import { chatTypingStore } from "./chatTypingStore"

/**
 * Whether the partner is typing in `threadId` right now. Lapsed entries are
 * pruned by the store's single expiry timer, which re-renders subscribers.
 * With `announcement`, screen readers hear it once per typing session and at
 * most once per cooldown, queued behind current speech.
 */
export function usePartnerTyping(
  threadId: string | undefined,
  partnerUserId: string | undefined,
  announcement?: string
): boolean {
  const { entries } = useSyncExternalStore(chatTypingStore.subscribe, chatTypingStore.getSnapshot, chatTypingStore.getSnapshot)
  const typing = isPartnerTyping(entries, threadId, partnerUserId, Date.now())
  const wasTypingRef = useRef(false)
  const lastAnnouncedAtRef = useRef<number | null>(null)

  useEffect(() => {
    const now = Date.now()
    if (announcement && shouldAnnounceTyping({
      isTyping: typing,
      wasTyping: wasTypingRef.current,
      lastAnnouncedAt: lastAnnouncedAtRef.current,
      now
    })) {
      lastAnnouncedAtRef.current = now
      AccessibilityInfo.announceForAccessibilityWithOptions(announcement, { queue: true })
    }
    wasTypingRef.current = typing
  }, [announcement, typing])

  return typing
}
