export type BlockHydrationSource = "local" | "server"
export type BlockHydrationStatus = "loading" | "ready" | "failed"

export interface BlockOwnerState {
  ownerUserId: string
  blockedUserIds: string[]
  localStatus: BlockHydrationStatus
  serverStatus: BlockHydrationStatus
}

export function createBlockOwnerState(ownerUserId: string): BlockOwnerState {
  return {
    ownerUserId,
    blockedUserIds: [],
    localStatus: "loading",
    serverStatus: "loading"
  }
}

export function replaceBlockedUsers(
  state: BlockOwnerState,
  ownerUserId: string,
  blockedUserIds: string[]
): BlockOwnerState {
  if (state.ownerUserId !== ownerUserId) return state
  return {
    ...state,
    blockedUserIds: normalizeBlockedUserIds(blockedUserIds)
  }
}

export function applyBlockHydrationSuccess(
  state: BlockOwnerState,
  ownerUserId: string,
  blockedUserIds: string[],
  source: BlockHydrationSource
): BlockOwnerState {
  if (state.ownerUserId !== ownerUserId) return state
  if (source === "local" && state.serverStatus === "ready") {
    return { ...state, localStatus: "ready" }
  }
  return {
    ...replaceBlockedUsers(state, ownerUserId, blockedUserIds),
    ...(source === "local"
      ? { localStatus: "ready" as const }
      : { serverStatus: "ready" as const })
  }
}

export function shouldApplyBlockServerResponse(input: {
  currentRequestGeneration: number
  responseRequestGeneration: number
  currentMutationGeneration: number
  startedMutationGeneration: number
}): boolean {
  return (
    input.currentRequestGeneration === input.responseRequestGeneration &&
    input.currentMutationGeneration === input.startedMutationGeneration
  )
}

export function applyBlockHydrationFailure(
  state: BlockOwnerState,
  ownerUserId: string,
  source: BlockHydrationSource
): BlockOwnerState {
  if (state.ownerUserId !== ownerUserId) return state
  return {
    ...state,
    ...(source === "local"
      ? { localStatus: "failed" as const }
      : { serverStatus: "failed" as const })
  }
}

export function isBlockOwnerReady(
  state: BlockOwnerState,
  requireServerHydration: boolean
): boolean {
  return requireServerHydration
    ? state.serverStatus === "ready"
    : state.localStatus === "ready"
}

function normalizeBlockedUserIds(userIds: string[]): string[] {
  return [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
}
