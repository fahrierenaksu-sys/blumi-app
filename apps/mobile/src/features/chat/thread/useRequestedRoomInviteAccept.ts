import { useEffect, useEffectEvent, useRef } from "react"
import {
  getRoomInviteActions,
  type ChatRoomInviteAction,
  type ChatRoomInviteTimelineItem
} from "../chatRoomInviteModel"

export type RequestedRoomInviteStep =
  | { kind: "run"; action: ChatRoomInviteAction }
  | { kind: "wait" }
  | { kind: "drop" }

/**
 * What the invite notification's "Enter room" button does once its chat is
 * open: accept the invite (the card's own accept), or open the room when it
 * was already accepted. Waits while the invite is not loaded yet; anything
 * else (declined, expired, cancelled, not addressed to me) is dropped and the
 * card shows why.
 */
export function resolveRequestedRoomInviteStep(
  invites: readonly ChatRoomInviteTimelineItem[],
  inviteId: string,
  currentUserId: string
): RequestedRoomInviteStep {
  const invite = invites.find((entry) => entry.inviteId === inviteId)
  if (!invite) return { kind: "wait" }
  if (invite.recipientUserId !== currentUserId) return { kind: "drop" }
  const action = getRoomInviteActions(invite, currentUserId)
    .find((entry) => entry.type === "accept" || entry.type === "open_room")
  return action ? { kind: "run", action } : { kind: "drop" }
}

/** Runs a one-shot `roomInviteAccept` route param exactly once, then clears it. */
export function useRequestedRoomInviteAccept(input: {
  inviteId: string | undefined
  isFocused: boolean
  invites: readonly ChatRoomInviteTimelineItem[]
  currentUserId: string
  onAction: (action: ChatRoomInviteAction) => void
  clearRequest: () => void
}): void {
  const { inviteId, isFocused, invites, currentUserId } = input
  const handledRef = useRef<string | null>(null)
  const run = useEffectEvent((step: RequestedRoomInviteStep) => {
    input.clearRequest()
    if (step.kind === "run") input.onAction(step.action)
  })

  useEffect(() => {
    if (!inviteId || !isFocused || handledRef.current === inviteId) return
    const step = resolveRequestedRoomInviteStep(invites, inviteId, currentUserId)
    if (step.kind === "wait") return
    handledRef.current = inviteId
    run(step)
  }, [currentUserId, inviteId, invites, isFocused])
}
