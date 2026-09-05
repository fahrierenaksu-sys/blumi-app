export interface ConnectionMatchPresentationDependencies {
  hasPresented: (miniRoomId: string) => boolean
  markPresented: (miniRoomId: string) => void
  captureMatchCreated: () => void
  showMatchToast: (toast: { title: string; body: string }) => void
  showMatchModal: (match: {
    miniRoomId: string
    matchedUserName: string
    matchedUserId: string
  }) => void
}

export interface ConnectionMatchPresentationInput {
  miniRoomId: string
  matchedUserId: string
  matchedUserName: string
  mode: "demo" | "production"
}

export function presentConnectionMatch(
  dependencies: ConnectionMatchPresentationDependencies,
  input: ConnectionMatchPresentationInput
): boolean {
  if (dependencies.hasPresented(input.miniRoomId)) return false

  dependencies.markPresented(input.miniRoomId)
  dependencies.captureMatchCreated()
  dependencies.showMatchToast({
    title: "It's a match! ✨",
    body: `You and ${input.matchedUserName} both saved the moment`
  })
  dependencies.showMatchModal({
    miniRoomId: input.miniRoomId,
    matchedUserName: input.matchedUserName,
    matchedUserId: input.matchedUserId
  })
  return true
}
