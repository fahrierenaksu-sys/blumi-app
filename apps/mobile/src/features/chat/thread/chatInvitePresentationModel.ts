import { compareChatTimelineItems, type ChatRoomInviteTimelineItem } from "../chatRoomInviteModel"
import type { ChatRoomInviteHistory } from "../chatRoomInvitePagingStore"

/** Current composer context is separate from retained historical card state. */
export function getRoomInviteComposerContext(
  invites: readonly ChatRoomInviteTimelineItem[], history: Pick<ChatRoomInviteHistory, "ready" | "activeInviteIds">
): readonly ChatRoomInviteTimelineItem[] {
  if (!history.ready) return invites
  const active = new Set(history.activeInviteIds)
  return invites.filter(invite => active.has(invite.inviteId))
}

/** Historical cards keep their status and actions while avoiding a room scene. */
export function getCompactRoomInviteIds(
  invites: readonly ChatRoomInviteTimelineItem[], activeInviteIds: readonly string[]
): ReadonlySet<string> {
  const newest = invites.reduce<ChatRoomInviteTimelineItem | undefined>((latest, invite) =>
    !latest || compareChatTimelineItems(invite, latest) > 0 ? invite : latest, undefined)
  const active = new Set(activeInviteIds)
  return new Set(invites.filter(invite => invite.inviteId !== newest?.inviteId &&
    invite.status !== "pending" && !(active.has(invite.inviteId) && invite.status === "accepted" && Boolean(invite.roomSessionId))).map(invite => invite.inviteId))
}
