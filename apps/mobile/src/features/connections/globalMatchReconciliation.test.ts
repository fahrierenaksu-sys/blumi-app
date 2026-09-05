import assert from "node:assert/strict"
import test from "node:test"
import type { SessionActor } from "../session/sessionModel"
import {
  reconcileRealtimeConnectionMatch,
  type GlobalMatchReconciliationDependencies
} from "./globalMatchReconciliation"

const actor = {
  session: {
    mode: "production",
    sessionToken: "token-ada",
    userId: "ada",
    accountId: "account-ada",
    sessionId: "session-ada",
    expiresAt: "2026-07-23T00:00:00.000Z",
    onboarding: { profile: "complete", avatar: "complete", room: "complete" }
  },
  profile: { userId: "ada", displayName: "Ada", avatar: { presetId: "dusk" } }
} as SessionActor

const staleActor = {
  ...actor,
  session: { ...actor.session, sessionToken: "token-ada-refreshed" }
} as SessionActor

const payload = {
  miniRoomId: "room_match",
  participantUserIds: ["ada", "bora"] as [string, string],
  matchedAt: "2026-07-22T00:00:00.000Z"
}

function createDependencies(
  getCurrentSessionActor: () => SessionActor | null,
  overrides: Partial<GlobalMatchReconciliationDependencies> = {}
): GlobalMatchReconciliationDependencies & {
  createdThreads: string[]
  presentedMatches: string[]
} {
  const dependencies = {
    getCurrentSessionActor,
    recordMutualConnection: async () => ({
      userId: "bora",
      displayName: "Bora",
      savedAt: "2026-07-22T00:00:00.000Z",
      status: "mutual" as const
    }),
    hydrateFromServer: async () => undefined,
    createThread: async () => ({
      threadId: "thread_match",
      miniRoomId: "room_match",
      participantUserIds: ["ada", "bora"] as [string, string],
      participants: [{ userId: "ada" }, { userId: "bora" }],
      createdAt: "2026-07-22T00:00:00.000Z"
    }),
    applyChatThreadCreated: (thread: { threadId: string }) => {
      dependencies.createdThreads.push(thread.threadId)
    },
    presentMatch: (match: { miniRoomId: string }) => {
      dependencies.presentedMatches.push(match.miniRoomId)
    },
    createdThreads: [],
    presentedMatches: [],
    ...overrides
  } as GlobalMatchReconciliationDependencies & {
    createdThreads: string[]
    presentedMatches: string[]
  }
  return dependencies
}

test("does not apply match side effects after the authenticated session changes", async () => {
  let currentActor: SessionActor | null = actor
  type Connection = {
    userId: string
    displayName: string
    savedAt: string
    status: "mutual"
  }
  let resolveConnection: ((value: Connection) => void) | undefined
  const connection = new Promise<Connection>((resolve) => {
    resolveConnection = resolve
  })
  const dependencies = createDependencies(
    () => currentActor,
    { recordMutualConnection: () => connection }
  )

  const reconciliation = reconcileRealtimeConnectionMatch(payload, actor, dependencies)
  currentActor = staleActor
  resolveConnection?.({
    userId: "bora",
    displayName: "Bora",
    savedAt: "2026-07-22T00:00:00.000Z",
    status: "mutual"
  })
  await reconciliation

  assert.deepEqual(dependencies.createdThreads, [])
  assert.deepEqual(dependencies.presentedMatches, [])
})

test("creates the authorized chat thread and presents a current-session match", async () => {
  const dependencies = createDependencies(() => actor)

  await reconcileRealtimeConnectionMatch(payload, actor, dependencies)

  assert.deepEqual(dependencies.createdThreads, ["thread_match"])
  assert.deepEqual(dependencies.presentedMatches, ["room_match"])
})

test("contains a failed account hydration request inside the match flow", async () => {
  const dependencies = createDependencies(
    () => actor,
    {
      hydrateFromServer: async () => {
        throw new Error("stale token")
      }
    }
  )

  await reconcileRealtimeConnectionMatch(payload, actor, dependencies)

  assert.deepEqual(dependencies.presentedMatches, ["room_match"])
})
