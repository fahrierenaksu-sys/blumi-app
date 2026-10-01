import type { ChatTypingCommand, ChatTypingUpdated } from "@blumi/contracts"
import {
  applyTypingUpdate,
  clearTypingForMessage,
  clearTypingForUser,
  nextTypingExpiry,
  NO_PARTNER_TYPING,
  pruneExpiredTyping,
  type PartnerTypingEntries
} from "./chatTypingModel"

/**
 * Typing state for the signed-in account. Memory only: nothing about typing
 * is persisted, logged or reported. The global realtime session configures
 * it per account and `chat_typing` rollout; an account switch resets it.
 */
export interface ChatTypingSnapshot {
  ownerUserId: string | undefined
  /** `chat_typing` resolved for this session: this device may send signals. */
  sendEnabled: boolean
  entries: PartnerTypingEntries
}

export interface ChatTypingStore {
  configure(session: {
    ownerUserId: string | undefined
    enabled: boolean
    send: (command: ChatTypingCommand) => boolean
  }): () => void
  reset(): void
  /** Sends one signal when enabled; false when it did not go out. */
  send(command: ChatTypingCommand): boolean
  applyUpdate(payload: ChatTypingUpdated): void
  noteMessage(message: { threadId: string; senderUserId: string }): void
  clearUser(userId: string): void
  getSnapshot(): ChatTypingSnapshot
  subscribe(listener: () => void): () => void
}

const EMPTY: ChatTypingSnapshot = Object.freeze({ ownerUserId: undefined, sendEnabled: false, entries: NO_PARTNER_TYPING })

export function createChatTypingStore(clock: {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}): ChatTypingStore {
  let snapshot: ChatTypingSnapshot = EMPTY
  let transport: ((command: ChatTypingCommand) => boolean) | null = null
  let expiryTimer: unknown = null
  const listeners = new Set<() => void>()

  const publish = (next: ChatTypingSnapshot): void => {
    if (next === snapshot) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  // One timer for the earliest lapse: a lapsed indicator disappears on its own.
  const scheduleExpiry = (): void => {
    if (expiryTimer !== null) clock.clearTimeout(expiryTimer)
    expiryTimer = null
    const expiry = nextTypingExpiry(snapshot.entries)
    if (expiry === null) return
    expiryTimer = clock.setTimeout(() => {
      expiryTimer = null
      setEntries(pruneExpiredTyping(snapshot.entries, clock.now()))
    }, Math.max(0, expiry - clock.now()))
  }

  const setEntries = (entries: PartnerTypingEntries): void => {
    if (entries !== snapshot.entries) publish({ ...snapshot, entries })
    scheduleExpiry()
  }

  const reset = (): void => {
    transport = null
    if (expiryTimer !== null) clock.clearTimeout(expiryTimer)
    expiryTimer = null
    publish(EMPTY)
  }

  return {
    configure(session) {
      reset()
      transport = session.send
      publish({ ownerUserId: session.ownerUserId, sendEnabled: session.enabled && Boolean(session.ownerUserId), entries: NO_PARTNER_TYPING })
      const configured = transport
      return () => { if (transport === configured) reset() }
    },
    reset,
    send(command) {
      if (!snapshot.sendEnabled || !transport) return false
      return transport(command)
    },
    applyUpdate(payload) {
      if (!snapshot.ownerUserId) return
      setEntries(applyTypingUpdate(snapshot.entries, payload, { localUserId: snapshot.ownerUserId, now: clock.now() }))
    },
    noteMessage(message) {
      setEntries(clearTypingForMessage(snapshot.entries, message))
    },
    clearUser(userId) {
      setEntries(clearTypingForUser(snapshot.entries, userId))
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
}

export const chatTypingStore = createChatTypingStore({
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
})
