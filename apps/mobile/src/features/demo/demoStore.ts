/**
 * demoStore – centralized demo/dummy-data state manager.
 *
 * When demo mode is active, the LobbyScreen consumes profiles from here
 * instead of the real WebSocket lobby flow. Swiping right on a profile
 * that has `hasLikedMe: true` produces a match, which injects a thread
 * into the chatStore so the matched person appears in the Inbox.
 */

import { useCallback, useEffect, useState } from "react"
import type {
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../chat/chatRoomInviteModel"
import {
  DUMMY_PROFILES,
  DEMO_CURRENT_USER,
  shouldTriggerMatch,
  type DummyProfile
} from "./dummyProfiles"
import {
  applyChatThreadCreated,
  applyChatMessageReceived
} from "../chat/chatStore"

// ─── In-memory state ─────────────────────────────────────────

let demoEnabled = false
let likedUserIds: Set<string> = new Set()
let skippedUserIds: Set<string> = new Set()
let matchedUserIds: Set<string> = new Set()
let pendingMatchUserId: string | null = null // set when a match animation should play
let demoRoomInvites: ChatRoomInviteTimelineItem[] = []
let demoCurrentUser: DemoLikeCurrentUser = {
  userId: DEMO_CURRENT_USER.userId,
  displayName: DEMO_CURRENT_USER.displayName
}
let demoTimers: ReturnType<typeof setTimeout>[] = []

type DemoListener = () => void
const demoListeners: Set<DemoListener> = new Set()

function notifyDemo(): void {
  for (const l of demoListeners) l()
}

function clearDemoTimers(): void {
  for (const timer of demoTimers) clearTimeout(timer)
  demoTimers = []
}

function scheduleDemoWork(work: () => void, delayMs: number): void {
  const timer = setTimeout(() => {
    demoTimers = demoTimers.filter((candidate) => candidate !== timer)
    work()
  }, delayMs)
  demoTimers = [...demoTimers, timer]
}

// ─── Actions ─────────────────────────────────────────────────

export function isDemoMode(): boolean {
  return demoEnabled
}

export function setDemoMode(enabled: boolean): void {
  clearDemoTimers()
  demoEnabled = enabled
  likedUserIds.clear()
  skippedUserIds.clear()
  matchedUserIds.clear()
  pendingMatchUserId = null
  demoRoomInvites = []
  demoCurrentUser = {
    userId: DEMO_CURRENT_USER.userId,
    displayName: DEMO_CURRENT_USER.displayName
  }
  notifyDemo()
}

/** Get the visible deck (profiles not yet liked/skipped) */
export function getDemoDeck(): DummyProfile[] {
  return DUMMY_PROFILES.filter(
    (p) => !likedUserIds.has(p.userId) && !skippedUserIds.has(p.userId)
  )
}

/** Get the current "featured" candidate at top of deck */
export function getDemoFeatured(): DummyProfile | null {
  const deck = getDemoDeck()
  return deck[0] ?? null
}

export interface DemoLikeCurrentUser {
  userId: string
  displayName: string
}

/** Get local room invitations created by or sent to demo users. */
export function getDemoRoomInvites(): ChatRoomInviteTimelineItem[] {
  return demoRoomInvites.map((invite) => ({ ...invite }))
}

function getDemoProfileForThread(threadId: string): DummyProfile | null {
  const prefix = "demo-thread-"
  if (!threadId.startsWith(prefix)) return null
  return DUMMY_PROFILES.find((profile) => profile.userId === threadId.slice(prefix.length)) ?? null
}

function createDemoRoomInviteRecord(input: {
  threadId: string
  senderUserId: string
  recipientUserId: string
}): ChatRoomInviteTimelineItem {
  const existing = demoRoomInvites.find(
    (invite) =>
      invite.threadId === input.threadId &&
      invite.status === "pending" &&
      invite.senderUserId === input.senderUserId &&
      invite.recipientUserId === input.recipientUserId
  )
  if (existing) return { ...existing }

  const createdAt = new Date().toISOString()
  const invite: ChatRoomInviteTimelineItem = {
    kind: "room_invite",
    inviteId: `demo-invite-${input.threadId}-${input.senderUserId}`,
    threadId: input.threadId,
    senderUserId: input.senderUserId,
    recipientUserId: input.recipientUserId,
    createdAt,
    status: "pending",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }
  demoRoomInvites = [
    ...demoRoomInvites.filter((candidate) => candidate.inviteId !== invite.inviteId),
    invite
  ]
  notifyDemo()
  return { ...invite }
}

/** Create an outgoing room invite from the local demo user. */
export function createDemoRoomInvite(
  threadId: string,
  currentUser: DemoLikeCurrentUser = demoCurrentUser
): ChatRoomInviteTimelineItem {
  const profile = getDemoProfileForThread(threadId)
  if (!profile) throw new Error("That demo match is not available.")
  demoCurrentUser = { ...currentUser }
  return createDemoRoomInviteRecord({
    threadId,
    senderUserId: currentUser.userId,
    recipientUserId: profile.userId
  })
}

/** Apply a local demo room-invite action without calling the production API. */
export function demoRoomInviteAction(
  action: ChatRoomInviteAction,
  currentUser: DemoLikeCurrentUser = demoCurrentUser
): ChatRoomInviteTimelineItem | null {
  if (action.type === "create") {
    return createDemoRoomInvite(action.threadId, currentUser)
  }

  const existing = demoRoomInvites.find((invite) => invite.inviteId === action.inviteId)
  if (!existing) return null
  const isSender = existing.senderUserId === currentUser.userId
  const isRecipient = existing.recipientUserId === currentUser.userId

  if (action.type === "accept" || action.type === "decline") {
    if (!isRecipient || existing.status !== "pending") return null
    const nextInvite: ChatRoomInviteTimelineItem = {
      ...existing,
      status: action.type === "accept" ? "accepted" : "declined",
      ...(action.type === "accept"
        ? { roomSessionId: `demo-room-session-${existing.threadId}` }
        : {}),
      ...(action.type === "accept" || action.type === "decline"
        ? { expiresAt: existing.expiresAt }
        : {})
    }
    demoRoomInvites = demoRoomInvites.map((invite) =>
      invite.inviteId === nextInvite.inviteId ? nextInvite : invite
    )
    notifyDemo()
    return { ...nextInvite }
  }

  if (action.type === "cancel") {
    if (!isSender || existing.status !== "pending") return null
    const nextInvite = { ...existing, status: "cancelled" as const }
    demoRoomInvites = demoRoomInvites.map((invite) =>
      invite.inviteId === nextInvite.inviteId ? nextInvite : invite
    )
    notifyDemo()
    return { ...nextInvite }
  }

  if (
    action.type === "open_room" &&
    (isSender || isRecipient) &&
    existing.status === "accepted" &&
    existing.roomSessionId === action.roomSessionId
  ) {
    return { ...existing }
  }

  return null
}

/** Like (swipe right) the current featured profile */
export function demoLike(
  userId: string,
  currentUser?: DemoLikeCurrentUser
): { matched: boolean; profile: DummyProfile | null } {
  const profile = DUMMY_PROFILES.find((p) => p.userId === userId)
  if (!profile) return { matched: false, profile: null }

  if (currentUser) demoCurrentUser = { ...currentUser }

  likedUserIds.add(userId)

  if (shouldTriggerMatch(userId)) {
    matchedUserIds.add(userId)
    pendingMatchUserId = userId

    // Prefer the real session user so the chat thread's "self" participant
    // matches sessionActor.profile.userId. Without this, ChatThreadScreen's
    // `participants.find(p => p.userId !== currentUserId)` lookup would return
    // the hardcoded demo self entry and render the user's own name as the partner.
    const selfUserId = currentUser?.userId ?? DEMO_CURRENT_USER.userId
    const selfDisplayName =
      currentUser?.displayName ?? DEMO_CURRENT_USER.displayName

    // Inject a chat thread for this match so it appears in Inbox
    const threadId = `demo-thread-${userId}`
    applyChatThreadCreated({
      threadId,
      miniRoomId: `demo-miniroom-${userId}`,
      participantUserIds: [selfUserId, userId],
      participants: [
        { userId: selfUserId, displayName: selfDisplayName },
        { userId, displayName: profile.displayName }
      ],
      createdAt: new Date().toISOString(),
      lastMessage: undefined
    })

    // Auto-send a greeting message from the matched person after a short delay
    scheduleDemoWork(() => {
      if (!matchedUserIds.has(userId)) return
      applyChatMessageReceived({
        messageId: `demo-msg-${userId}-1`,
        threadId,
        senderUserId: userId,
        body: `Hi, I’m ${profile.firstName}. Glad we matched.`,
        sentAt: new Date().toISOString()
      })
    }, 1500)

    // Follow up with an inbound room invite so the user can try the MiniRoom
    // directly from the chat thread without leaving the conversation.
    scheduleDemoWork(() => {
      if (!matchedUserIds.has(userId)) return
      createDemoRoomInviteRecord({
        threadId,
        senderUserId: userId,
        recipientUserId: selfUserId
      })
    }, 2800)

    notifyDemo()
    return { matched: true, profile }
  }

  notifyDemo()
  return { matched: false, profile }
}

/** Skip (swipe left) the current featured profile */
export function demoSkip(userId: string): void {
  skippedUserIds.add(userId)
  notifyDemo()
}

/** Get and clear pending match (for modal display) */
export function consumePendingMatch(): DummyProfile | null {
  if (!pendingMatchUserId) return null
  const profile = DUMMY_PROFILES.find((p) => p.userId === pendingMatchUserId) ?? null
  pendingMatchUserId = null
  return profile
}

/** Check if a match is pending */
export function hasPendingMatch(): boolean {
  return pendingMatchUserId !== null
}

/** Get all matched profiles */
export function getMatchedProfiles(): DummyProfile[] {
  return DUMMY_PROFILES.filter((p) => matchedUserIds.has(p.userId))
}

/** Reset the demo deck back to beginning */
export function resetDemoDeck(): void {
  clearDemoTimers()
  likedUserIds.clear()
  skippedUserIds.clear()
  matchedUserIds.clear()
  pendingMatchUserId = null
  demoRoomInvites = []
  notifyDemo()
}

// ─── Reactive hook ───────────────────────────────────────────

export interface DemoStoreView {
  isDemo: boolean
  deck: DummyProfile[]
  featured: DummyProfile | null
  matchedProfiles: DummyProfile[]
  roomInvites: ChatRoomInviteTimelineItem[]
  deckRemaining: number
  like: (
    userId: string,
    currentUser?: DemoLikeCurrentUser
  ) => { matched: boolean; profile: DummyProfile | null }
  skip: (userId: string) => void
  consumeMatch: () => DummyProfile | null
  hasPendingMatch: boolean
  reset: () => void
}

export function useDemoStore(): DemoStoreView {
  const [, setTick] = useState(0)

  const sync = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    demoListeners.add(sync)
    return () => {
      demoListeners.delete(sync)
    }
  }, [sync])

  const deck = getDemoDeck()

  return {
    isDemo: demoEnabled,
    deck,
    featured: deck[0] ?? null,
    matchedProfiles: getMatchedProfiles(),
    roomInvites: getDemoRoomInvites(),
    deckRemaining: deck.length,
    like: demoLike,
    skip: demoSkip,
    consumeMatch: consumePendingMatch,
    hasPendingMatch: hasPendingMatch(),
    reset: resetDemoDeck
  }
}
