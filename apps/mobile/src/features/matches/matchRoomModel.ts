import type { AvatarSelection, ChatThread } from "@blumi/contracts"
import { cloneAvatarSelection } from "../avatarV2/avatarSelectionModel"

export type MatchId = string
export type MatchMode = "demo" | "local" | "futureBackend"

export interface MatchParticipant {
  userId: string
  displayName: string
  avatarPresetId?: string
  avatarSelection?: AvatarSelection
}

export interface BlumiMatch {
  id: MatchId
  mode: MatchMode
  createdAt: string
  currentUser: MatchParticipant
  matchedUser: MatchParticipant
  roomOwnerUserId: string
  backendBoundary: "local-demo-only" | "future-backend-adapter"
}

interface MatchExperienceSessionActor {
  session: {
    onboarding: {
      profile: "incomplete" | "complete"
      avatar: "incomplete" | "complete"
      room: "incomplete" | "complete"
    }
  }
}

interface CreateLocalDemoMatchInput {
  currentUser: MatchParticipant
  matchedUser: MatchParticipant
  now?: string
  mode?: Extract<MatchMode, "demo" | "local">
}

export function canOpenMatchExperience(
  actor: MatchExperienceSessionActor | null | undefined
): boolean {
  return Boolean(
    actor &&
    actor.session.onboarding.profile === "complete" &&
    actor.session.onboarding.avatar === "complete" &&
    actor.session.onboarding.room === "complete"
  )
}

export function createLocalDemoMatch(
  input: CreateLocalDemoMatchInput
): BlumiMatch {
  const createdAt = input.now ?? new Date().toISOString()
  const mode = input.mode ?? "demo"
  return {
    id: createStableMatchId({
      currentUserId: input.currentUser.userId,
      matchedUserId: input.matchedUser.userId,
      createdAt
    }),
    mode,
    createdAt,
    currentUser: copyParticipant(input.currentUser),
    matchedUser: copyParticipant(input.matchedUser),
    roomOwnerUserId: input.currentUser.userId,
    backendBoundary: "local-demo-only"
  }
}

export function createMatchFromPersistedThread(
  thread: ChatThread,
  viewerUserId: string
): BlumiMatch | null {
  const matchId = thread.threadId.startsWith("thread_match_")
    ? thread.threadId.slice("thread_match_".length)
    : ""
  if (!matchId || thread.miniRoomId !== `match_${matchId}`) return null
  const currentUser = thread.participants.find((participant) => participant.userId === viewerUserId)
  const matchedUser = thread.participants.find((participant) => participant.userId !== viewerUserId)
  if (!currentUser?.displayName || !matchedUser?.displayName) return null
  return {
    id: matchId,
    mode: "futureBackend",
    createdAt: thread.createdAt,
    currentUser: {
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarPresetId: currentUser.avatar?.loadout?.bodyId ?? currentUser.avatar?.presetId,
      ...(currentUser.avatar
        ? { avatarSelection: cloneAvatarSelection(currentUser.avatar) }
        : {})
    },
    matchedUser: {
      userId: matchedUser.userId,
      displayName: matchedUser.displayName,
      avatarPresetId: matchedUser.avatar?.loadout?.bodyId ?? matchedUser.avatar?.presetId,
      ...(matchedUser.avatar
        ? { avatarSelection: cloneAvatarSelection(matchedUser.avatar) }
        : {})
    },
    roomOwnerUserId: viewerUserId,
    backendBoundary: "future-backend-adapter"
  }
}

function copyParticipant(participant: MatchParticipant): MatchParticipant {
  return {
    userId: participant.userId,
    displayName: participant.displayName,
    ...(participant.avatarPresetId ? { avatarPresetId: participant.avatarPresetId } : {}),
    ...(participant.avatarSelection
      ? { avatarSelection: cloneAvatarSelection(participant.avatarSelection) }
      : {})
  }
}

function createStableMatchId(input: {
  currentUserId: string
  matchedUserId: string
  createdAt: string
}): MatchId {
  return `match-${hashStableString([
    input.currentUserId,
    input.matchedUserId,
    input.createdAt
  ].join("|"))}`
}

function hashStableString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}
