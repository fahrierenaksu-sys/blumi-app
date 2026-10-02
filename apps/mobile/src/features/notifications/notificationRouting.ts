export type NotificationDestination =
  | { route: "ChatThread"; params: { threadId: string; roomInviteAccept?: string } }
  | { route: "Inbox" }
  | { route: "Lobby" }

/**
 * Where a notification response opens. `enter_room` is the room invite's
 * "Enter room" button: the invite's chat opens and accepts that invite with
 * the chat's own accept action (a one-shot `roomInviteAccept` param).
 */
export function resolveNotificationDestination(
  data: unknown,
  action?: "enter_room"
): NotificationDestination | null {
  if (!data || typeof data !== "object") return null
  const record = data as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type : ""

  if (type === "chat.message") {
    const threadId = normalizeIdentifier(record.threadId)
    return threadId
      ? { route: "ChatThread", params: { threadId } }
      : null
  }
  if (type === "chat.room_invite") {
    const threadId = normalizeIdentifier(record.threadId)
    const inviteId = action === "enter_room" ? normalizeIdentifier(record.inviteId) : null
    return threadId
      ? { route: "ChatThread", params: inviteId ? { threadId, roomInviteAccept: inviteId } : { threadId } }
      : null
  }
  if (type === "connection.matched") return { route: "Inbox" }
  if (type === "discovery.like") return { route: "Lobby" }
  if (type === "discovery.match") return { route: "Inbox" }
  if (type === "discovery.watch_match") return { route: "Lobby" }
  if (type === "mini_room.invite") return { route: "Lobby" }
  return null
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}
