export type NotificationDestination =
  | { route: "ChatThread"; params: { threadId: string } }
  | { route: "Inbox" }
  | { route: "Lobby" }

export function resolveNotificationDestination(
  data: unknown
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
    return threadId
      ? { route: "ChatThread", params: { threadId } }
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
