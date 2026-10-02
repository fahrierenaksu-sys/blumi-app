import type { ChatTimelineItem } from "../chatRoomInviteModel"

/**
 * The soft tap for a message that arrives in the open conversation (haptic
 * map: message arrives → soft). Only when the viewer is reading, not
 * typing: with the keyboard up their attention is already on the thread, and
 * a tap under the fingers would interrupt them. One tap per update, however
 * many messages it brings; my own messages and invitations never tap.
 */
export function shouldTapForIncomingArrival(input: {
  arrivedItems: readonly ChatTimelineItem[]
  currentUserId: string
  composerFocused: boolean
  screenFocused: boolean
}): boolean {
  if (!input.screenFocused || input.composerFocused) return false
  return input.arrivedItems.some((item) =>
    item.kind === "message" && item.message.senderUserId !== input.currentUserId
  )
}
