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

const boraAvatar = {
  presetId: "avatar_v2_body_default",
  revision: 4,
  loadout: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: []
  }
} as const

test("presents the partner's real avatar and name from the opened chat (DSC-3)", async () => {
  const presented: unknown[] = []
  const dependencies = createDependencies(() => actor, {
    // A partner first seen on this device is saved under the raw id.
    recordMutualConnection: async () => ({
      userId: "bora",
      displayName: "bora",
      savedAt: "2026-07-22T00:00:00.000Z",
      status: "mutual" as const
    }),
    createThread: async () => ({
      threadId: "thread_match",
      miniRoomId: "room_match",
      participantUserIds: ["ada", "bora"] as [string, string],
      participants: [
        { userId: "ada", displayName: "Ada" },
        { userId: "bora", displayName: "Bora", avatar: boraAvatar as never }
      ],
      createdAt: "2026-07-22T00:00:00.000Z"
    }),
    presentMatch: (match) => { presented.push(match) }
  })

  await reconcileRealtimeConnectionMatch(payload, actor, dependencies)

  assert.deepEqual(presented, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    matchedAvatarSelection: boraAvatar,
    mode: "production"
  }])
})

test("still presents the match, without a remote avatar, when the chat cannot be opened", async () => {
  const presented: unknown[] = []
  const dependencies = createDependencies(() => actor, {
    createThread: async () => { throw new Error("offline") },
    presentMatch: (match) => { presented.push(match) }
  })

  await reconcileRealtimeConnectionMatch(payload, actor, dependencies)

  assert.deepEqual(dependencies.createdThreads, [])
  assert.deepEqual(presented, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production"
  }])
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
