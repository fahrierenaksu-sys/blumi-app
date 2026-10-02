/**
 * Foreground presentation of pushes (the app is open when they arrive).
 * The server queues every push; the phone decides here whether the OS banner
 * adds anything: it stays hidden when the conversation is already on screen
 * (a chat, the shared room, or the Chats list for messages) or when another
 * surface (the match screen or modal, an earlier banner, a message already
 * shown in its open chat) presented the same event. Whichever is first claims
 * the event. There is no in-app message toast (owner decision 2026-10-02):
 * a message for a conversation that is not on screen is announced only by
 * the OS banner.
 */
export interface ForegroundNotificationPresentation {
  shouldShowBanner: boolean
  shouldShowList: boolean
  shouldPlaySound: false
  shouldSetBadge: false
}

export function foregroundAlertKey(data: unknown): string | null {
  const record = asRecord(data)
  if (!record) return null
  switch (record.type) {
    case "chat.message": return keyFor("message", record.messageId)
    case "chat.room_invite": return keyFor("room-invite", record.inviteId)
    case "discovery.match": return keyFor("match", record.matchId)
    default: return null
  }
}

export function resolveForegroundNotificationPresentation(input: {
  data: unknown
  appActive: boolean
  suppressMessageAlerts?: boolean
  isConversationFocused: (threadId: string) => boolean
  claimAlert: (key: string) => boolean
}): ForegroundNotificationPresentation {
  const record = asRecord(input.data)
  const key = foregroundAlertKey(record)
  const show = (visible: boolean): ForegroundNotificationPresentation => ({
    shouldShowBanner: visible, shouldShowList: visible, shouldPlaySound: false, shouldSetBadge: false
  })
  if (!input.appActive) {
    const firstPresentation = key ? input.claimAlert(key) : true
    return show(record?.type === "chat.message" ? firstPresentation : true)
  }
  if (record?.type === "chat.message" && input.suppressMessageAlerts) {
    if (key) input.claimAlert(key)
    return show(false)
  }
  const threadId = identifier(record?.threadId)
  if ((record?.type === "chat.message" || record?.type === "chat.room_invite") &&
    threadId && input.isConversationFocused(threadId)) {
    if (key) input.claimAlert(key)
    return show(false)
  }
  // The realtime match modal presents this event while the app is open.
  if (record?.type === "connection.matched") return show(false)
  return show(key ? input.claimAlert(key) : true)
}

/**
 * A message received over the socket while the app is open. A message whose
 * conversation is visible (or while message alerts are suppressed) claims its
 * alert, so a push that arrives late for it never banners. A message that is
 * not visible leaves the claim to its push banner. Returns whether it was seen.
 */
export function claimVisibleIncomingMessage(
  message: { threadId: string; messageId: string },
  isVisible: (threadId: string) => boolean,
  claimAlert: (key: string) => boolean
): boolean {
  if (!isVisible(message.threadId)) return false
  const key = keyFor("message", message.messageId)
  if (key) claimAlert(key)
  return true
}

/** A delivered message or room-invite notification of this conversation. */
export function isConversationNotificationData(data: unknown, threadId: string): boolean {
  const record = asRecord(data)
  return (record?.type === "chat.message" || record?.type === "chat.room_invite") &&
    identifier(record.threadId) === threadId
}

export interface ForegroundAlertLedger {
  /** True when the key was not presented recently; records it either way. */
  claim(key: string): boolean
  reset(): void
  size(): number
}

export function createForegroundAlertLedger(options: {
  capacity?: number
  ttlMs?: number
  now?: () => number
} = {}): ForegroundAlertLedger {
  const capacity = options.capacity ?? 256
  const ttlMs = options.ttlMs ?? 10 * 60_000
  const now = options.now ?? Date.now
  const claimedAt = new Map<string, number>()
  return {
    claim(key) {
      const time = now()
      const previous = claimedAt.get(key)
      if (previous !== undefined && time - previous <= ttlMs) return false
      claimedAt.delete(key)
      claimedAt.set(key, time)
      while (claimedAt.size > capacity) {
        const oldest = claimedAt.keys().next().value
        if (oldest === undefined) break
        claimedAt.delete(oldest)
      }
      return true
    },
    reset() { claimedAt.clear() },
    size() { return claimedAt.size }
  }
}

function keyFor(prefix: string, value: unknown): string | null {
  const id = identifier(value)
  return id ? `${prefix}:${id}` : null
}

function identifier(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}
