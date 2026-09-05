import assert from "node:assert/strict"
import test from "node:test"
import {
  createMatchFromDiscoveryResult,
  decideDiscoverProfile,
  DiscoveryDecisionNotEligibleError,
  DiscoveryProfileUnavailableError,
  fetchDiscoverProfile,
  fetchDiscoverPage,
  fetchDiscoverProfiles,
  fetchDiscoveryWatch,
  activateDiscoveryWatch,
  cancelDiscoveryWatch,
  isDiscoveryWatchActive
} from "./discoveryApi"

const DISCOVERY_QUOTA = {
  limit: 10,
  extensionDecisions: 0,
  used: 1,
  remaining: 9,
  resetsAt: "2026-07-23T00:00:00.000Z",
  rewardedAd: { available: false, extensionDecisions: 10 }
} as const

test("expired discovery cursor exposes a restart marker instead of silently appending a new deck", async () => {
  await assert.rejects(fetchDiscoverPage("https://api.test", "token", {ageMin:18,ageMax:99,genders:[],vibes:[]},
    {cursor:"v2.expired"}, (async () => createJsonResponse(409, {error:"Expired",code:"DISCOVERY_CURSOR_EXPIRED"})) as typeof fetch),
    (error: any) => error.code === "DISCOVERY_CURSOR_EXPIRED")
})

test("refresh budget remains a typed retryable error distinct from cursor reset", async()=>{
  await assert.rejects(fetchDiscoverPage("https://api.test","token",{ageMin:18,ageMax:99,genders:[],vibes:[]},{},
    (async()=>createJsonResponse(429,{error:"Later",code:"DISCOVERY_REFRESH_LIMIT",retryAfterSeconds:60})) as typeof fetch),
    (error:any)=>error.code==="DISCOVERY_REFRESH_LIMIT" && error.retryAfterSeconds===60)
})

test("discovery watch APIs persist, read, and cancel the low-supply request", async () => {
  const watchPayload = {
    watch: {
      userId: "me",
      status: "active",
      preferences: {
        ageMin: 23,
        ageMax: 35,
        genders: ["woman"],
        vibes: ["coffee"]
      },
      updatedAt: "2026-07-21T10:00:00.000Z",
      expiresAt: "2026-07-28T10:00:00.000Z"
    }
  }
  const calls: { url: string; method?: string }[] = []
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method })
    if (init?.method === "DELETE") return createJsonResponse(204, null)
    return createJsonResponse(200, watchPayload)
  }) as typeof fetch

  assert.equal((await fetchDiscoveryWatch("https://api.test", "token", fetcher))?.status, "active")
  assert.deepEqual(
    (await activateDiscoveryWatch("https://api.test", "token", fetcher)).preferences,
    { ageMin: 23, ageMax: 35, genders: ["woman"], vibes: ["coffee"] }
  )
  await cancelDiscoveryWatch("https://api.test", "token", fetcher)
  assert.deepEqual(calls, [
    { url: "https://api.test/v1/discover/watch", method: undefined },
    { url: "https://api.test/v1/discover/watch", method: "PUT" },
    { url: "https://api.test/v1/discover/watch", method: "DELETE" }
  ])
})

test("discovery watch activity expires locally without waiting for another fetch", () => {
  const watch = {
    userId: "user_1",
    status: "active" as const,
    preferences: {
      ageMin: 18,
      ageMax: 99,
      genders: [],
      vibes: []
    },
    updatedAt: "2026-07-21T10:00:00.000Z",
    expiresAt: "2026-07-28T10:00:00.000Z"
  }

  assert.equal(
    isDiscoveryWatchActive(watch, new Date("2026-07-28T09:59:59.999Z")),
    true
  )
  assert.equal(
    isDiscoveryWatchActive(watch, new Date("2026-07-28T10:00:00.000Z")),
    false
  )
})

const COMPLETE_DISCOVERY_AVATAR = {
  presetId: "avatar_v2_body_default",
  revision: 5,
  loadout: {
    schemaVersion: 2 as const,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_blush_lace_cardigan",
    bottomId: "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
    shoesId: "avatar_v2_shoes_cherry_satin_ballets",
    accessoryIds: [],
    dressId: null,
    outerwearId: null
  }
}

test("discovery retains the complete server avatar for exact remote rendering", async () => {
  const profiles = await fetchDiscoverProfiles(
    "https://api.blumi.test",
    "session-token",
    { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
    async () => new Response(JSON.stringify({
      profiles: [{
        userId: "remote-1",
        displayName: "Defne",
        age: 24,
        distanceLabel: "3 km away",
        vibeTags: ["coffee"],
        avatarPresetId: COMPLETE_DISCOVERY_AVATAR.presetId,
        avatar: COMPLETE_DISCOVERY_AVATAR
      }]
    }), { status: 200 })
  )
  assert.deepEqual(profiles[0]?.avatar, COMPLETE_DISCOVERY_AVATAR)
  assert.notEqual(
    profiles[0]?.avatar.loadout?.accessoryIds,
    COMPLETE_DISCOVERY_AVATAR.loadout.accessoryIds
  )
})

test("fetchDiscoverProfiles loads authenticated production profiles", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const profiles = await fetchDiscoverProfiles(
    "http://localhost:4000/",
    "session_token",
    {
      ageMin: 23,
      ageMax: 31,
      genders: ["woman", "man"],
      vibes: ["Coffee dates", "Slow burn"]
    },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(200, {
        profiles: [
          {
            userId: "discover_defne",
            displayName: "Defne Yildiz",
            age: 24,
            bio: "Coffee, ceramics, and slow Sundays.",
            prompts: [
              { promptId: "invented", answer: "Must not leak." },
              { promptId: "small_joy", answer: "  Fresh   coffee. " },
              { promptId: "ask_me_about", answer: "x".repeat(121) }
            ],
            distanceLabel: "3 km away",
            vibeTags: ["coffee dates"],
            avatarPresetId: "blonde-waves"
          }
        ]
      })
    }) as typeof fetch
  )

  assert.equal(
    calls[0]?.url,
    "http://localhost:4000/v1/discover?ageMin=23&ageMax=31&gender=woman&gender=man&vibe=Coffee+dates&vibe=Slow+burn"
  )
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.match(
    (calls[0]?.init?.headers as Record<string, string>)[
      "x-blumi-client-capabilities"
    ],
    /discovery_room_showcase/
  )
  assert.equal(profiles[0]?.displayName, "Defne Yildiz")
  assert.equal(profiles[0]?.bio, "Coffee, ceramics, and slow Sundays.")
  assert.deepEqual(profiles[0]?.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee." }
  ])
  assert.deepEqual(profiles[0]?.vibeTags, ["coffee dates"])
})

test("fetchDiscoverPage omits legacy radius controls and returns global supply metadata", async () => {
  const calls: string[] = []
  const page = await fetchDiscoverPage(
    "https://api.blumi.test",
    "session-token",
    { ageMin: 18, ageMax: 35, genders: ["woman"], vibes: ["coffee"] },
    { limit: 12, cursor: "v1:12" },
    (async (url: RequestInfo | URL) => {
      calls.push(String(url))
      return createJsonResponse(200, {
        profiles: [{
          userId: "remote-1",
          displayName: "Defne",
          age: 24,
          distanceLabel: "In your area",
          vibeTags: ["coffee"],
          signals: ["Both into coffee"],
          roomSnapshotUrl: "/v1/room-showcase/room-1",
          avatarPresetId: COMPLETE_DISCOVERY_AVATAR.presetId,
          avatar: COMPLETE_DISCOVERY_AVATAR
        }],
        page: { nextCursor: "v1:24", hasMore: true },
        supply: {
          state: "low",
          scope: "global"
        },
        quota: DISCOVERY_QUOTA
      })
    }) as typeof fetch
  )

  assert.doesNotMatch(calls[0] ?? "", /radiusKm=/)
  assert.match(calls[0] ?? "", /limit=12/)
  assert.match(calls[0] ?? "", /cursor=v1%3A12/)
  assert.equal(page.page.nextCursor, "v1:24")
  assert.equal(page.supply.state, "low")
  assert.deepEqual(page.quota, DISCOVERY_QUOTA)
  assert.deepEqual(page.profiles[0]?.signals, ["Both into coffee"])
  assert.equal(
    page.profiles[0]?.roomSnapshotUrl,
    "https://api.blumi.test/v1/room-showcase/room-1"
  )
})

test("fetchDiscoverProfile preserves the server-authoritative deep-link decision capability", async () => {
  const controller = new AbortController()
  const profile = await fetchDiscoverProfile(
    "https://api.blumi.app",
    "session_token",
    "user/with space",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "https://api.blumi.app/v1/discover/user%2Fwith%20space")
      assert.ok(init?.signal)
      assert.equal(init.signal.aborted, false)
      return createJsonResponse(200, {
        profile: {
          userId: "user/with space",
          displayName: "Defne Yildiz",
          age: 24,
          bio: "Looking for a kind, curious connection.",
          distanceLabel: "3 km away",
          vibeTags: ["coffee dates"],
          avatarPresetId: "blonde-waves"
        },
        decision: { capability: "view-only" }
      })
    }) as typeof fetch,
    controller.signal
  )

  assert.equal(profile.profile.userId, "user/with space")
  assert.equal(profile.profile.bio, "Looking for a kind, curious connection.")
  assert.equal(profile.decision.capability, "view-only")
})

test("fetchDiscoverProfile caller cancellation reaches the composed transport signal", async () => {
  const controller = new AbortController()
  let transportSignal: AbortSignal | null | undefined
  const loading = fetchDiscoverProfile("https://api.test", "token", "profile-1", async (_url, init) => {
    transportSignal = init?.signal
    return new Promise<Response>(() => {})
  }, controller.signal)
  const rejected = assert.rejects(loading, { name: "AbortError" })
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
})

test("fetchDiscoverProfile rejects a malformed deep-link decision capability", async () => {
  await assert.rejects(
    () => fetchDiscoverProfile(
      "https://api.test",
      "session_token",
      "profile-1",
      (async () => createJsonResponse(200, {
        profile: {
          userId: "profile-1",
          displayName: "Defne",
          age: 24,
          distanceLabel: "3 km away",
          vibeTags: ["coffee"],
          avatarPresetId: "blonde-waves"
        },
        decision: { capability: "mutual-like-because-query-says-so" }
      })) as typeof fetch
    ),
    /deep-linked profile/i
  )
})

test("fetchDiscoverProfile distinguishes a missing profile from a transport failure", async () => {
  await assert.rejects(
    () =>
      fetchDiscoverProfile(
        "https://api.test",
        "session_token",
        "missing",
        (async () => createJsonResponse(404, {
          error: "That profile is not available anymore."
        })) as typeof fetch
      ),
    (error: unknown) => error instanceof DiscoveryProfileUnavailableError
  )

  await assert.rejects(
    () =>
      fetchDiscoverProfile(
        "https://api.test",
        "session_token",
        "offline",
        (async () => createJsonResponse(503, {
          error: "Try again later."
        })) as typeof fetch
      ),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof DiscoveryProfileUnavailableError) &&
      error.message === "Try again later."
  )
})

test("decideDiscoverProfile posts like/pass and builds a backend match preview", async () => {
  const result = await decideDiscoverProfile(
    "http://localhost:4000",
    "session_token",
    "discover_defne",
    "like",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(
        String(url),
        "http://localhost:4000/v1/discover/discover_defne/like"
      )
      assert.equal(init?.method, "POST")
      return createJsonResponse(200, {
        decision: {
          fromUserId: "me",
          toUserId: "discover_defne",
          decision: "like",
          decidedAt: "2026-06-27T00:00:00.000Z"
        },
        matched: true,
        match: {
          matchId: "match_1",
          participantUserIds: ["me", "discover_defne"],
          matchedAt: "2026-06-27T00:00:00.000Z"
        },
        quota: DISCOVERY_QUOTA
      })
    }) as typeof fetch
  )

  const match = createMatchFromDiscoveryResult({
    currentUser: { userId: "me", displayName: "Mina" },
    matchedUser: { userId: "discover_defne", displayName: "Defne Yildiz" },
    result
  })

  assert.equal(result.matched, true)
  assert.equal(result.quota.remaining, 9)
  assert.equal(match?.mode, "futureBackend")
  assert.equal(match?.backendBoundary, "future-backend-adapter")
  assert.equal(match?.matchedUser.displayName, "Defne Yildiz")
})

test("decideDiscoverProfile preserves the server stale-eligibility contract", async () => {
  await assert.rejects(
    () => decideDiscoverProfile(
      "https://api.test",
      "session_token",
      "profile-1",
      "like",
      (async () => createJsonResponse(409, {
        error: "That profile is not available for a decision.",
        code: "DISCOVERY_DECISION_NOT_ELIGIBLE"
      })) as typeof fetch
    ),
    (error: unknown) => error instanceof DiscoveryDecisionNotEligibleError
  )
})

test("discovery API rejects server errors and malformed payloads", async () => {
  await assert.rejects(
    () =>
      decideDiscoverProfile(
        "http://localhost:4000",
        "session_token",
        "missing",
        "pass",
        (async () => createJsonResponse(400, { error: "That profile is gone." })) as typeof fetch
      ),
    /profile is gone/
  )

  await assert.rejects(
    () =>
      fetchDiscoverProfiles(
        "http://localhost:4000",
        "session_token",
        { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
        (async () => createJsonResponse(200, { profiles: [{ userId: 4 }] })) as typeof fetch
      ),
    /Discover profile/
  )

  await assert.rejects(
    () =>
      decideDiscoverProfile(
        "http://localhost:4000",
        "session_token",
        "discover_defne",
        "like",
        (async () => createJsonResponse(200, {
          decision: {
            fromUserId: "me",
            toUserId: "discover_defne",
            decision: "like",
            decidedAt: "2026-06-27T00:00:00.000Z"
          },
          matched: true,
          match: null
        })) as typeof fetch
      ),
    /open that match/
  )

  await assert.rejects(
    () =>
      decideDiscoverProfile(
        "http://localhost:4000",
        "session_token",
        "discover_defne",
        "pass",
        (async () => createJsonResponse(200, {
          decision: {
            fromUserId: "me",
            toUserId: "discover_defne",
            decision: "pass",
            decidedAt: "2026-06-27T00:00:00.000Z"
          },
          matched: false,
          match: {
            matchId: "match_1",
            participantUserIds: ["me", "discover_defne"],
            matchedAt: "2026-06-27T00:00:00.000Z"
          }
        })) as typeof fetch
      ),
    /Discover choice/
  )
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
