import type { AvatarSelection } from "@blumi/contracts"

export interface ConnectionMatchPresentationDependencies {
  hasPresented: (miniRoomId: string) => boolean
  markPresented: (miniRoomId: string) => void
  captureMatchCreated: () => void
  showMatchModal: (match: {
    miniRoomId: string
    matchedUserName: string
    matchedUserId: string
    /** The partner's real avatar from the opened chat (UX audit DSC-3). */
    matchedAvatarSelection?: AvatarSelection
  }) => void
}

export interface ConnectionMatchPresentationInput {
  miniRoomId: string
  matchedUserId: string
  matchedUserName: string
  matchedAvatarSelection?: AvatarSelection
  mode: "demo" | "production"
}

/**
 * Presents a mutual match once. The modal is the whole celebration: the
 * English-only toast that used to sit on top of it was removed (UX audit
 * DSC-1, 2026-10-01).
 */
export function presentConnectionMatch(
  dependencies: ConnectionMatchPresentationDependencies,
  input: ConnectionMatchPresentationInput
): boolean {
  if (dependencies.hasPresented(input.miniRoomId)) return false

  dependencies.markPresented(input.miniRoomId)
  dependencies.captureMatchCreated()
  dependencies.showMatchModal({
    miniRoomId: input.miniRoomId,
    matchedUserName: input.matchedUserName,
    matchedUserId: input.matchedUserId,
    ...(input.matchedAvatarSelection ? { matchedAvatarSelection: input.matchedAvatarSelection } : {})
  })
  return true
}
