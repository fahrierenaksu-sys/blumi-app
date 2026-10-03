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
  threadId?: string
  isFocused: boolean
  invites: readonly ChatRoomInviteTimelineItem[]
  currentUserId: string
  onAction: (action: ChatRoomInviteAction) => void
  clearRequest: () => void
  ensureRoomInvite?: (threadId: string, inviteId: string) => Promise<boolean>
}): void {
  const { inviteId, isFocused, invites, currentUserId, threadId, ensureRoomInvite } = input
  const handledRef = useRef<string | null>(null)
  const lookupRef = useRef<string | null>(null)
  const requestKey = inviteId ? `${currentUserId}:${threadId ?? ""}:${inviteId}` : null
  const needsLookup = !!inviteId && !invites.some(invite => invite.inviteId === inviteId)
  const run = useEffectEvent((step: RequestedRoomInviteStep) => {
    input.clearRequest()
    if (step.kind === "run") input.onAction(step.action)
  })

  useEffect(() => {
    if (!inviteId || !isFocused || handledRef.current === requestKey) return
    const step = resolveRequestedRoomInviteStep(invites, inviteId, currentUserId)
    if (step.kind === "wait") return
    handledRef.current = requestKey
    run(step)
  }, [currentUserId, inviteId, invites, isFocused, requestKey])

  useEffect(() => {
    if (!inviteId || !requestKey || !isFocused || !needsLookup || !threadId || !ensureRoomInvite || handledRef.current === requestKey) return
    if (lookupRef.current === requestKey) return
    lookupRef.current = requestKey
    let active = true
    void ensureRoomInvite(threadId, inviteId).then(found => {
      if (!active || found) return
      handledRef.current = requestKey
      run({ kind: "drop" })
    }).catch(() => {
      // Retry on the next foreground focus; never walk all history pages to
      // resolve a single old notification.
      if (lookupRef.current === requestKey) lookupRef.current = null
    })
    return () => { active = false; if (lookupRef.current === requestKey) lookupRef.current = null }
  }, [inviteId, isFocused, needsLookup, requestKey, ensureRoomInvite, threadId])
}
