import type { RealtimeAccessRevocation } from "../auth/realtimeAccessRevocation"

/**
 * Optional capabilities of a fanout beyond event delivery (2026-10-01).
 *
 * - Peer awareness: an instance that knows no other instance is listening
 *   delivers locally and skips the NOTIFY round trip, which was one database
 *   query per MiniRoom move, presence update and chat delivery.
 * - Access revocations: a sign-out or moderation decision on one instance
 *   drops the cached authorization on every other instance at once.
 */
export interface RealtimeFanoutControl {
  /** True unless this instance knows that no other instance is listening. */
  hasRemotePeers(): boolean
  publishAccessRevocation(revocation: RealtimeAccessRevocation): Promise<void>
  subscribeAccessRevocations(listener: (revocation: RealtimeAccessRevocation) => void): () => void
}

const MAX_REVOCATION_USER_ID_LENGTH = 256

/** Strict decoder for revocations arriving from another instance. */
export function parseRemoteAccessRevocation(value: unknown): RealtimeAccessRevocation | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (record.kind === "all") return { kind: "all" }
  if (record.kind !== "user") return null
  const userId = record.userId
  if (typeof userId !== "string" || userId.length === 0 ||
    userId.length > MAX_REVOCATION_USER_ID_LENGTH || /[\u0000\r\n]/.test(userId)) {
    return null
  }
  return { kind: "user", userId }
}
