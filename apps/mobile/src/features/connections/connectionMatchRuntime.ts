import type { ServerEvent } from "@blumi/contracts"

export type ConnectionMatchedEvent = Extract<
  ServerEvent,
  { type: "connection.matched" }
>

export interface ConnectionMatchDeduplicationState {
  handledMatchIds: ReadonlySet<string>
  reconcilingMatchIds: ReadonlySet<string>
}

/**
 * Decides whether a realtime match event belongs to this session and still
 * needs reconciliation. The caller owns the sets; this predicate is pure.
 */
export function shouldHandleConnectionMatchedEvent(
  event: ConnectionMatchedEvent,
  actorUserId: string | undefined,
  state: ConnectionMatchDeduplicationState
): boolean {
  if (!actorUserId) return false
  if (!event.payload.participantUserIds.includes(actorUserId)) return false

  const { miniRoomId } = event.payload
  return !state.handledMatchIds.has(miniRoomId) &&
    !state.reconcilingMatchIds.has(miniRoomId)
}
