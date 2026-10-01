/**
 * Foreground presentation of pushes (the app is open when they arrive).
 * The server queues every push; the phone decides here whether the OS banner
 * adds anything: it stays hidden when the conversation is already on screen or
 * when an in-app surface (message toast, match screen, match modal) already
 * showed the same event. Whichever surface is first claims the event.
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

/** Whether the in-app toast should present a message received over the socket. */
export function shouldShowInAppMessageAlert(
  message: { threadId: string; messageId: string },
  isConversationFocused: (threadId: string) => boolean,
  claimAlert: (key: string) => boolean
): boolean {
  const key = keyFor("message", message.messageId)
  if (isConversationFocused(message.threadId)) {
    if (key) claimAlert(key)
    return false
  }
  return key ? claimAlert(key) : true
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
