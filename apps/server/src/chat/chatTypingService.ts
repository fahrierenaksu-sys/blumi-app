import { chatTypingCommandSchema, type ChatTypingState, type ServerEvent } from "@blumi/contracts"

/** How long a `start` shows on the partner's phone unless renewed (phones renew every 3 s). */
export const CHAT_TYPING_EXPIRES_MS = 6_000
/** Participant pairs never change after a thread is created; this bounds the cache. */
const MAX_CACHED_THREAD_PAIRS = 2_000

export interface ChatTypingService {
  /**
   * `chat.typing` from one authorized socket. Never throws and never answers
   * the sender: a malformed, foreign, blocked or switched-off signal is
   * dropped silently, so nothing reveals whether a thread or a block exists.
   */
  relay(input: { connectionId: string; userId: string; payload: unknown }): Promise<void>
}

export interface ChatTypingThreadLookup {
  findThread(threadId: string): Promise<{ participantUserIds: readonly string[] } | null>
}

/**
 * Typing indicator relay (2026-10-01). Transient by design: the signal holds
 * no text and is never stored, logged, pushed or put on the outbox. It reaches
 * only the other participant of an existing thread, only while neither person
 * blocks the other and both have `chat_typing` (the kill switch) on. The
 * sender's socket is authorized by the realtime server before this runs and
 * the partner's sockets by the connection manager on delivery, so a banned or
 * signed-out account neither sends nor receives it.
 */
export function createChatTypingService(options: {
  threads: ChatTypingThreadLookup
  blockPolicy: { hasBlockBetween(userAId: string, userBId: string): Promise<boolean> }
  isRolledOutFor: (userId: string) => boolean
  emit: (userId: string, event: ServerEvent) => void
  expiresInMs?: number
}): ChatTypingService {
  const { threads, blockPolicy, isRolledOutFor, emit } = options
  const expiresInMs = options.expiresInMs ?? CHAT_TYPING_EXPIRES_MS
  const pairs = new Map<string, readonly string[]>()
  const chains = new Map<string, Promise<void>>()

  const participantsOf = async (threadId: string): Promise<readonly string[] | null> => {
    const cached = pairs.get(threadId)
    if (cached) return cached
    const thread = await threads.findThread(threadId)
    if (!thread) return null
    const participants = Object.freeze([...thread.participantUserIds])
    if (pairs.size >= MAX_CACHED_THREAD_PAIRS) {
      const oldest = pairs.keys().next()
      if (!oldest.done) pairs.delete(oldest.value)
    }
    pairs.set(threadId, participants)
    return participants
  }

  const deliver = async (userId: string, threadId: string, state: ChatTypingState): Promise<void> => {
    if (!isRolledOutFor(userId)) return
    const participants = await participantsOf(threadId)
    if (!participants || !participants.includes(userId)) return
    const partnerUserId = participants.find((id) => id !== userId)
    if (!partnerUserId || !isRolledOutFor(partnerUserId)) return
    // Checked on every signal: a block takes effect on the next keystroke.
    if (await blockPolicy.hasBlockBetween(userId, partnerUserId)) return
    emit(partnerUserId, {
      type: "chat.typing_updated",
      payload: { threadId, userId, state, expiresInMs: state === "start" ? expiresInMs : 0 }
    })
  }

  return {
    async relay({ connectionId, userId, payload }) {
      const parsed = chatTypingCommandSchema.safeParse(payload)
      if (!parsed.success) return
      const { threadId, state } = parsed.data
      // One socket's signals for one thread are relayed in order, so a stop
      // that arrives while its start is still being checked never overtakes it.
      const key = `${connectionId}\u0000${threadId}`
      const previous = chains.get(key) ?? Promise.resolve()
      // Failures are dropped without a log line: typing is a best-effort hint.
      const current = previous.then(() => deliver(userId, threadId, state)).catch(() => undefined)
      chains.set(key, current)
      try {
        await current
      } finally {
        if (chains.get(key) === current) chains.delete(key)
      }
    }
  }
}

/**
 * `BLUMI_CHAT_TYPING_ENABLED`: the server kill switch. Unset, empty or "1"
 * keeps typing on; any other value ("0", "false", a typo) switches it off,
 * so an operator reaching for the switch never gets it left on.
 */
export function isChatTypingSwitchedOn(value: string | undefined): boolean {
  const flag = value?.trim()
  return !flag || flag === "1"
}
