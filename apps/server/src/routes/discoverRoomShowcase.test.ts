import test from "node:test"
import assert from "node:assert/strict"
import type { FastifyRequest } from "fastify"
import { createAuthService } from "../auth/authService"
import { createMatchService } from "../matches/matchService"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  createSeedDiscoverProfiles
} from "../matches/matchRepository"
import { DiscoveryRefreshLimitError } from "../matches/discoverySnapshot"
import { createServer } from "../server"
import { decorateDiscoverProfile } from "./discoverRoutes"

const request = {
  protocol: "http",
  headers: { host: "127.0.0.1:4000" }
} as FastifyRequest

async function createReadyViewer(
  authService: ReturnType<typeof createAuthService>,
  phoneNumber: string
) {
  const code = "482931"
  await authService.sendCode(phoneNumber)
  const signedIn = await authService.registerAccount(
    phoneNumber,
    code,
    { version: "test-terms-v1", locale: "en" }
  )
  await authService.updateProfile(signedIn.sessionToken, {
    displayName: "Discovery Test",
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(signedIn.sessionToken, step)
  }
  return signedIn
}

test("Discovery projects only the public snapshot for the current room revision", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 7,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const projected = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: {
      get: async () => room
    } as never,
    roomSnapshotService: {
      getLatestForUser: async () => ({
        userId: profile.userId,
        roomRevision: 7,
        assetKey: "a".repeat(64),
        mimeType: "image/webp",
        rendererVersion: "room-snapshot-v1",
        body: Buffer.from("snapshot"),
        isPublic: true,
        headline: "Kahve ve sohbet",
        updatedAt: room.updatedAt
      }),
      findByAssetKey: async () => null,
      publishForRoomSave: async () => {
        throw new Error("not used")
      },
      setVisibilityForRoom: async () => null
    }
  })

  assert.equal(
    projected.roomSnapshotUrl,
    `/v1/room-showcase/${"a".repeat(64)}`
  )
})

test("Discovery snapshot links cannot be poisoned through the request Host header", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 7,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const projected = await decorateDiscoverProfile({
    profile,
    request: {
      protocol: "https",
      headers: { host: "attacker.example" }
    } as FastifyRequest,
    personalRoomDecorService: { get: async () => room } as never,
    roomSnapshotService: {
      getLatestForUser: async () => ({
        userId: profile.userId,
        roomRevision: room.revision,
        assetKey: "c".repeat(64),
        mimeType: "image/webp",
        rendererVersion: "room-snapshot-v1",
        body: Buffer.from("snapshot"),
        isPublic: true,
        headline: null,
        updatedAt: room.updatedAt
      })
    } as never
  })

  assert.equal(projected.roomSnapshotUrl, `/v1/room-showcase/${"c".repeat(64)}`)
  assert.doesNotMatch(String(projected.roomSnapshotUrl), /attacker\.example/)
})

test("Discovery hides private and stale room snapshots", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 8,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const personalRoomDecorService = { get: async () => room }
  const privateSnapshotService = {
    getLatestForUser: async () => ({
      userId: profile.userId,
      roomRevision: 8,
      assetKey: "b".repeat(64),
      mimeType: "image/webp" as const,
      rendererVersion: "room-snapshot-v1",
      body: Buffer.from("snapshot"),
      isPublic: false,
      headline: null,
      updatedAt: room.updatedAt
    }),
    findByAssetKey: async () => null,
    publishForRoomSave: async () => {
      throw new Error("not used")
    },
    setVisibilityForRoom: async () => null
  }
  const hidden = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: privateSnapshotService as never
  })
  assert.equal("roomSnapshotUrl" in hidden, false)

  const capabilityHidden = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: privateSnapshotService as never,
    allowRoomShowcase: false
  })
  assert.equal("roomSnapshotUrl" in capabilityHidden, false)

  const stale = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: {
      ...privateSnapshotService,
      getLatestForUser: async () => null
    } as never
  })
  assert.equal("roomSnapshotUrl" in stale, false)
})

test("Discovery keeps the base profile when optional room showcase enrichment fails", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const warnings: unknown[] = []
  const requestWithLogger = {
    ...request,
    log: {
      warn: (context: unknown) => {
        warnings.push(context)
      }
    }
  } as unknown as FastifyRequest

  const roomReadFailure = await decorateDiscoverProfile({
    profile,
    request: requestWithLogger,
    personalRoomDecorService: {
      get: async () => {
        throw new Error("room storage unavailable")
      }
    } as never,
    roomSnapshotService: {} as never
  })
  assert.equal(roomReadFailure.userId, profile.userId)
  assert.equal("roomSnapshotUrl" in roomReadFailure, false)

  const snapshotReadFailure = await decorateDiscoverProfile({
    profile,
    request: requestWithLogger,
    personalRoomDecorService: {
      get: async () => ({
        userId: profile.userId,
        revision: 1,
        decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    } as never,
    roomSnapshotService: {
      getLatestForUser: async () => {
        throw new Error("snapshot storage unavailable")
      }
    } as never
  })
  assert.equal(snapshotReadFailure.userId, profile.userId)
  assert.equal("roomSnapshotUrl" in snapshotReadFailure, false)
  assert.equal(warnings.length, 2)
})

test("the first Discovery page does not wait for or read optional room showcases", { timeout: 5_000 }, async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const candidate = createSeedDiscoverProfiles()[0]!
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([candidate]))
  })
  let roomReads = 0
  let snapshotReads = 0
  const never = new Promise<never>(() => undefined)
  const app = createServer({
    authService,
    matchService,
    personalRoomDecorService: {
      get: () => {
        roomReads += 1
        return never
      }
    } as never,
    roomSnapshotService: {
      getLatestForUser: () => {
        snapshotReads += 1
        return never
      }
    } as never
  })

  try {
    const signedIn = await createReadyViewer(authService, "+905551117777")
    const response = await app.inject({
      method: "GET",
      url: "/v1/discover?limit=12",
      headers: { authorization: `Bearer ${signedIn.sessionToken}` }
    })

    assert.equal(response.statusCode, 200, response.body)
    const body = response.json()
    assert.equal(body.profiles[0]?.userId, candidate.userId)
    assert.equal("roomSnapshotUrl" in body.profiles[0], false)
    assert.equal("roomHeadline" in body.profiles[0], false)
    assert.equal(typeof body.quota.remaining, "number")
    assert.equal(roomReads, 0)
    assert.equal(snapshotReads, 0)
  } finally {
    await app.close()
  }
})

test("the first Discovery page reads decision quota concurrently with its snapshot page", { timeout: 5_000 }, async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const candidate = createSeedDiscoverProfiles()[0]!
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([candidate]))
  })
  const getDecisionQuota = matchService.getDecisionQuota.bind(matchService)
  let quotaStartedBeforePageCompleted = false
  let releasePage!: (value: {
    profiles: typeof candidate[]
    page: { hasMore: boolean; nextCursor: string | null }
  }) => void
  let markPageStarted!: () => void
  const pageStarted = new Promise<void>((resolve) => { markPageStarted = resolve })
  const pageResult = new Promise<{
    profiles: typeof candidate[]
    page: { hasMore: boolean; nextCursor: string | null }
  }>((resolve) => { releasePage = resolve })
  const discoverySnapshots = {
    page: () => {
      markPageStarted()
      return pageResult
    }
  }
  matchService.getDecisionQuota = async (userId, now) => {
    quotaStartedBeforePageCompleted = true
    return getDecisionQuota(userId, now)
  }
  const app = createServer({ authService, matchService, discoverySnapshots: discoverySnapshots as never })

  try {
    const signedIn = await createReadyViewer(authService, "+905551116666")
    const responsePromise = app.inject({
      method: "GET",
      url: "/v1/discover?limit=12",
      headers: { authorization: `Bearer ${signedIn.sessionToken}` }
    })
    await pageStarted
    const quotaStartedBeforeRelease = quotaStartedBeforePageCompleted
    releasePage({ profiles: [candidate], page: { hasMore: false, nextCursor: null } })
    const response = await responsePromise

    assert.equal(response.statusCode, 200, response.body)
    assert.equal(quotaStartedBeforeRelease, true)
  } finally {
    await app.close()
  }
})

test("a concurrent quota read failure does not mask the Discovery refresh-limit response", { timeout: 5_000 }, async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const matchService = createMatchService()
  matchService.getDecisionQuota = async () => {
    throw new Error("quota database unavailable")
  }
  const discoverySnapshots = {
    page: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      throw new DiscoveryRefreshLimitError(23)
    }
  }
  const app = createServer({ authService, matchService, discoverySnapshots: discoverySnapshots as never })

  try {
    const signedIn = await createReadyViewer(authService, "+905551115555")
    const response = await app.inject({
      method: "GET",
      url: "/v1/discover?limit=12",
      headers: { authorization: `Bearer ${signedIn.sessionToken}` }
    })

    assert.equal(response.statusCode, 429, response.body)
    assert.equal(response.headers["retry-after"], "23")
    assert.equal(response.json().code, "DISCOVERY_REFRESH_LIMIT")
  } finally {
    await app.close()
  }
})

test("the authorized profile detail route hides room showcases for ineligible or quota-exhausted viewers", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const candidate = createSeedDiscoverProfiles()[0]!
  const matchStore = createInMemoryMatchStore([candidate])
  matchStore.targetDiscoveryGenders.set(candidate.userId, ["man"])
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(matchStore)
  })
  let blocked = false
  let roomReads = 0
  let showcaseReads = 0
  const room = {
    userId: candidate.userId,
    revision: 4,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const app = createServer({
    authService,
    matchService,
    safetyService: {
      listBlockedUserIdsBetween: async () => [],
      hasBlockBetween: async () => blocked
    } as never,
    personalRoomDecorService: {
      get: async () => {
        roomReads += 1
        return room
      }
    } as never,
    roomSnapshotService: {
      getLatestForUser: async () => {
        showcaseReads += 1
        return {
          userId: candidate.userId,
          roomRevision: room.revision,
          assetKey: "d".repeat(64),
          mimeType: "image/webp",
          rendererVersion: "room-snapshot-v1",
          body: Buffer.from("private snapshot bytes"),
          isPublic: true,
          headline: "A public room",
          updatedAt: room.updatedAt
        }
      }
    } as never,
    capabilityService: { resolve: () => ({ capabilities: { discovery_room_showcase: true } }) } as never
  })

  try {
    const unauthenticated = await app.inject({
      method: "GET",
      url: `/v1/discover/${candidate.userId}`
    })
    assert.equal(unauthenticated.statusCode, 401)

    const signedIn = await createReadyViewer(authService, "+905551118888")
    const headers = { authorization: `Bearer ${signedIn.sessionToken}` }

    const self = await app.inject({
      method: "GET",
      url: `/v1/discover/${signedIn.account.userId}`,
      headers
    })
    assert.equal(self.statusCode, 404)

    blocked = true
    const blockedProfile = await app.inject({
      method: "GET",
      url: `/v1/discover/${candidate.userId}`,
      headers
    })
    assert.equal(blockedProfile.statusCode, 404)
    assert.equal(roomReads, 0)
    assert.equal(showcaseReads, 0)

    blocked = false
    const ineligibleProfile = await app.inject({
      method: "GET",
      url: `/v1/discover/${candidate.userId}`,
      headers
    })
    assert.equal(ineligibleProfile.statusCode, 200, ineligibleProfile.body)
    assert.equal(ineligibleProfile.json().decision.capability, "view-only")
    assert.equal(ineligibleProfile.json().profile.displayName, candidate.displayName)
    assert.equal(ineligibleProfile.json().profile.age, candidate.age)
    assert.equal(roomReads, 0)
    assert.equal(showcaseReads, 0)
    assert.equal("roomHeadline" in ineligibleProfile.json().profile, false)
    assert.equal("roomSnapshotUrl" in ineligibleProfile.json().profile, false)

    const quotaDay = new Date().toISOString().slice(0, 10)
    matchStore.targetDiscoveryGenders.set(candidate.userId, ["woman"])
    matchStore.discoveryQuotas.set(`${signedIn.account.userId}:${quotaDay}`, {
      used: 10,
      extensionDecisions: 0
    })
    const quotaExhaustedProfile = await app.inject({
      method: "GET",
      url: `/v1/discover/${candidate.userId}`,
      headers
    })
    assert.equal(quotaExhaustedProfile.statusCode, 200, quotaExhaustedProfile.body)
    assert.equal(quotaExhaustedProfile.json().decision.capability, "view-only")
    assert.equal(quotaExhaustedProfile.json().profile.displayName, candidate.displayName)
    assert.equal(roomReads, 0)
    assert.equal(showcaseReads, 0)
    assert.equal("roomHeadline" in quotaExhaustedProfile.json().profile, false)
    assert.equal("roomSnapshotUrl" in quotaExhaustedProfile.json().profile, false)

    matchStore.discoveryQuotas.set(`${signedIn.account.userId}:${quotaDay}`, {
      used: 0,
      extensionDecisions: 0
    })
    const detail = await app.inject({
      method: "GET",
      url: `/v1/discover/${candidate.userId}`,
      headers
    })
    assert.equal(detail.statusCode, 200, detail.body)
    assert.equal(detail.json().profile.roomHeadline, "A public room")
    assert.equal(detail.json().profile.roomSnapshotUrl, `/v1/room-showcase/${"d".repeat(64)}`)
    assert.equal(detail.json().decision.capability, "mutual-like")
    assert.equal("decor" in detail.json().profile, false)
    assert.equal("body" in detail.json().profile, false)
    assert.equal(roomReads, 1)
    assert.equal(showcaseReads, 1)
  } finally {
    await app.close()
  }
})
