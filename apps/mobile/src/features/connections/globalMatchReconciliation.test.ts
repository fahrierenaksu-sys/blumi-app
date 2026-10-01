import assert from "node:assert/strict"
import test from "node:test"
import type { SessionActor } from "../session/sessionModel"
import {
  reconcileRealtimeConnectionMatch,
  reconcileRealtimeDiscoveryMatch,
  type DiscoveryMatchReconciliationDependencies,
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

test("a slow chat never holds the match back: it presents after a short wait and still saves the chat", async () => {
  const presented: unknown[] = []
  let finishThread: ((thread: Awaited<ReturnType<GlobalMatchReconciliationDependencies["createThread"]>>) => void) | undefined
  const dependencies = createDependencies(() => actor, {
    createThread: () => new Promise((resolve) => { finishThread = resolve }),
    presentMatch: (match) => { presented.push(match) },
    threadWaitMs: 5
  })

  await reconcileRealtimeConnectionMatch(payload, actor, dependencies)
  assert.deepEqual(presented, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production"
  }])

  finishThread?.({
    threadId: "thread_match",
    miniRoomId: "room_match",
    participantUserIds: ["ada", "bora"],
    participants: [{ userId: "ada" }, { userId: "bora" }],
    createdAt: "2026-07-22T00:00:00.000Z"
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(dependencies.createdThreads, ["thread_match"], "the late chat is still applied")
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

const discoveryPayload = {
  miniRoomId: "match_match_42",
  participantUserIds: ["ada", "bora"] as [string, string],
  matchedAt: "2026-10-01T00:00:00.000Z"
}

function discoveryThread(): import("@blumi/contracts").ChatThread {
  return {
    threadId: "thread_match_match_42",
    miniRoomId: "match_match_42",
    participantUserIds: ["ada", "bora"] as [string, string],
    participants: [
      { userId: "ada", displayName: "Ada" },
      { userId: "bora", displayName: "Bora", avatar: boraAvatar as never }
    ],
    createdAt: "2026-10-01T00:00:00.000Z"
  }
}

function createDiscoveryDependencies(overrides: Partial<DiscoveryMatchReconciliationDependencies> = {}) {
  const calls = { presented: [] as Array<Record<string, unknown>>, claimed: [] as string[], created: 0 }
  const dependencies: DiscoveryMatchReconciliationDependencies = {
    getCurrentSessionActor: () => actor,
    findThreadForPartner: () => discoveryThread(),
    createThread: async () => { calls.created += 1; return discoveryThread() },
    applyChatThreadCreated: () => undefined,
    claimMatchAlert: (key) => { calls.claimed.push(key) },
    presentMatch: (match) => { calls.presented.push({ ...match }) },
    httpBaseUrl: "https://api.example.test",
    threadWaitMs: 20,
    ...overrides
  }
  return { dependencies, calls }
}

test("a Discover match reaching the partner presents the chat's name and chibi without a saved connection or a request", async () => {
  const { dependencies, calls } = createDiscoveryDependencies()
  await reconcileRealtimeDiscoveryMatch(discoveryPayload, actor, dependencies)
  assert.equal(calls.created, 0, "the chat announced just before is already on the phone")
  assert.deepEqual(calls.claimed, ["match:match_42"], "its own match push banner stays quiet")
  assert.deepEqual(calls.presented, [{
    miniRoomId: "match_match_42",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    matchedAvatarSelection: boraAvatar,
    mode: "production",
    source: "discovery"
  }])
})

test("a Discover match whose chat is not on the phone yet opens it, and never shows an id as the name", async () => {
  const opened = createDiscoveryDependencies({ findThreadForPartner: () => undefined })
  await reconcileRealtimeDiscoveryMatch(discoveryPayload, actor, opened.dependencies)
  assert.equal(opened.calls.created, 1)
  assert.equal(opened.calls.presented[0]?.matchedUserName, "Bora")

  const nameless = createDiscoveryDependencies({
    findThreadForPartner: () => undefined,
    createThread: async () => { throw new Error("offline") }
  })
  await reconcileRealtimeDiscoveryMatch(discoveryPayload, actor, nameless.dependencies)
  assert.deepEqual(nameless.calls.presented, [])

  const switched = createDiscoveryDependencies({ getCurrentSessionActor: () => staleActor })
  await reconcileRealtimeDiscoveryMatch(discoveryPayload, actor, switched.dependencies)
  assert.deepEqual(switched.calls.presented, [])
})
