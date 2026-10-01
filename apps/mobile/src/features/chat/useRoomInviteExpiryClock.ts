import { useEffect, useState } from "react"
import { getNextRoomInviteExpiry, type ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"

/**
 * The time the invite cards are judged at. It advances once, by a single
 * timer, when the next shown pending invite expires, so a card flips to
 * "expired" live on both phones without polling or a server event.
 */
export function useRoomInviteExpiryClock(invites: readonly ChatRoomInviteTimelineItem[]): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    // Relative to the shown time: an invite that arrives already past its
    // expiry schedules an immediate update.
    const next = getNextRoomInviteExpiry(invites, nowMs)
    if (next === null) return
    const timer = setTimeout(() => setNowMs(Date.now()), Math.max(0, next - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [invites, nowMs])
  return nowMs
}
