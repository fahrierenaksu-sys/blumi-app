import type { ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"

/** Same invite values (every field), regardless of object identity. */
export function areRoomInvitesEqual(a: ChatRoomInviteTimelineItem, b: ChatRoomInviteTimelineItem): boolean {
  if (a === b) return true
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (!Object.is(a[key as keyof ChatRoomInviteTimelineItem], b[key as keyof ChatRoomInviteTimelineItem])) return false
  }
  return true
}

/** Same invites in the same order. */
export function areRoomInviteListsEqual(
  a: readonly ChatRoomInviteTimelineItem[],
  b: readonly ChatRoomInviteTimelineItem[]
): boolean {
  return a.length === b.length && a.every((invite, index) => areRoomInvitesEqual(invite, b[index]!))
}
