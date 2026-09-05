import type { ChatThread, ServerEvent } from "@blumi/contracts"
import type { SessionActor } from "../session/sessionModel"
import type { SavedConnection } from "./savedConnectionsStore"

export type ConnectionMatchedPayload = Extract<
  ServerEvent,
  { type: "connection.matched" }
>["payload"]

export interface GlobalMatchReconciliationDependencies {
  getCurrentSessionActor: () => SessionActor | null
  recordMutualConnection: (input: {
    ownerUserId: string
    currentUserId: string
    participantUserIds: readonly [string, string]
  }) => Promise<SavedConnection | undefined>
  hydrateFromServer: (sessionToken: string) => Promise<unknown>
  createThread: (
    baseHttpUrl: string,
    sessionToken: string,
    input: { participantUserIds: [string, string] }
  ) => Promise<ChatThread>
  applyChatThreadCreated: (thread: ChatThread) => void
  presentMatch: (match: {
    miniRoomId: string
    matchedUserId: string
    matchedUserName: string
    mode: SessionActor["session"]["mode"]
  }) => void
  httpBaseUrl: string
}

export function isSameAuthenticatedSession(
  expected: SessionActor,
  current: SessionActor | null
): boolean {
  return current?.profile.userId === expected.profile.userId &&
    current.session.sessionId === expected.session.sessionId &&
    current.session.sessionToken === expected.session.sessionToken
}

export async function reconcileRealtimeConnectionMatch(
  payload: ConnectionMatchedPayload,
  expectedActor: SessionActor,
  dependencies: GlobalMatchReconciliationDependencies
): Promise<void> {
  if (!isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
    return
  }

  const connection = await dependencies.recordMutualConnection({
    ownerUserId: expectedActor.profile.userId,
    currentUserId: expectedActor.profile.userId,
    participantUserIds: payload.participantUserIds
  })
  if (
    !connection ||
    !isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())
  ) {
    return
  }

  if (expectedActor.session.mode === "production") {
    void dependencies
      .hydrateFromServer(expectedActor.session.sessionToken)
      .catch(() => undefined)
    const participantUserIds = [...payload.participantUserIds] as [string, string]
    void dependencies
      .createThread(
        dependencies.httpBaseUrl,
        expectedActor.session.sessionToken,
        { participantUserIds }
      )
      .then((thread) => {
        if (isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
          dependencies.applyChatThreadCreated(thread)
        }
      })
      .catch(() => undefined)
  }

  if (!isSameAuthenticatedSession(expectedActor, dependencies.getCurrentSessionActor())) {
    return
  }

  dependencies.presentMatch({
    miniRoomId: payload.miniRoomId,
    matchedUserId: connection.userId,
    matchedUserName: connection.displayName,
    mode: expectedActor.session.mode
  })
}
