import assert from "node:assert/strict"
import test from "node:test"
import { saveProductionAvatar } from "./avatarApi"

const LOADOUT = {
  schemaVersion: 2 as const,
  bodyId: "avatar_v2_body_male_light",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe",
  noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile",
  hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
  dressId: null,
  outerwearId: null,
  accessoryIds: []
}

test("avatar API defaults to a legacy-safe V1 write when V2 write is not resolved", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const result = await saveProductionAvatar(
    "https://api.blumi.test/",
    "session-token",
    { loadout: LOADOUT, revision: 2 },
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        avatar: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 3 }
      }), { status: 200 })
    }
  )

  assert.equal(result.kind, "updated")
  assert.equal(result.selection.revision, 3)
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/users/me/avatar")
  assert.equal(calls[0]?.init?.method, "PUT")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session-token"
  )
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>)[
      "x-blumi-client-capabilities"
    ],
    undefined
  )
  const { dressId: _dressId, outerwearId: _outerwearId, ...legacyFields } = LOADOUT
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    loadout: { ...legacyFields, schemaVersion: 1 },
    revision: 2
  })
})

test("avatar API sends V2 only when write is resolved and declares read/write support", async () => {
  let headers: Record<string, string> | undefined
  let body: unknown
  await saveProductionAvatar(
    "https://api.blumi.test",
    "session-token",
    { loadout: LOADOUT, revision: 2 },
    async (_url, init) => {
      headers = init?.headers as Record<string, string>
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        avatar: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 3 }
      }), { status: 200 })
    },
    undefined,
    {
      avatar_loadout_v2_read: true,
      avatar_loadout_v2_write: true
    }
  )

  assert.equal(
    headers?.["x-blumi-client-capabilities"],
    "avatar_loadout_v2_read,avatar_loadout_v2_write"
  )
  assert.deepEqual(body, { loadout: LOADOUT, revision: 2 })
})

test("avatar API forwards a caller cancellation signal to the save request", async () => {
  const controller = new AbortController()
  let receivedSignal: AbortSignal | null | undefined

  await saveProductionAvatar(
    "https://api.blumi.test",
    "session-token",
    { loadout: LOADOUT, revision: 2 },
    async (_url, init) => {
      receivedSignal = init?.signal
      return new Response(JSON.stringify({
        avatar: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 3 }
      }), { status: 200 })
    },
    controller.signal
  )

  assert.equal(receivedSignal, controller.signal)
})

test("avatar API stops waiting when its caller cancels a stalled save", async () => {
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    saveProductionAvatar(
      "https://api.blumi.test",
      "session-token",
      { loadout: LOADOUT, revision: 2 },
      async () => new Response(JSON.stringify({
        avatar: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 3 }
      }), { status: 200 }),
      controller.signal
    ),
    /operation was aborted/
  )
})

test("avatar API retains canonical server state on revision conflict", async () => {
  const result = await saveProductionAvatar(
    "https://api.blumi.test",
    "session-token",
    { loadout: LOADOUT, revision: 1 },
    async () => new Response(JSON.stringify({
      code: "AVATAR_REVISION_CONFLICT",
      current: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 4 }
    }), { status: 409 })
  )
  assert.equal(result.kind, "conflict")
  if (result.kind === "conflict") assert.equal(result.current.revision, 4)
})

test("avatar API rejects an unrelated 409 even when it contains a parseable avatar", async () => {
  await assert.rejects(
    saveProductionAvatar(
      "https://api.blumi.test",
      "session-token",
      { loadout: LOADOUT, revision: 1 },
      async () => new Response(JSON.stringify({
        code: "SOME_FUTURE_CONFLICT",
        current: { presetId: LOADOUT.bodyId, loadout: LOADOUT, revision: 4 }
      }), { status: 409 })
    ),
    /save your avatar/
  )
})

test("avatar API canonicalizes a legacy V1 server response without losing response safety", async () => {
  const { dressId: _dressId, outerwearId: _outerwearId, ...common } = LOADOUT
  const legacyLoadout = { ...common, schemaVersion: 1 as const }
  const result = await saveProductionAvatar(
    "https://api.blumi.test",
    "session-token",
    { loadout: LOADOUT, revision: 1 },
    async () => new Response(JSON.stringify({
      avatar: {
        presetId: legacyLoadout.bodyId,
        loadout: legacyLoadout,
        revision: 2
      }
    }), { status: 200 })
  )

  assert.equal(result.kind, "updated")
  assert.deepEqual(result.selection.loadout, {
    ...legacyLoadout,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null
  })
})

test("avatar API fails closed on malformed canonical responses", async () => {
  await assert.rejects(
    saveProductionAvatar(
      "https://api.blumi.test",
      "session-token",
      { loadout: LOADOUT, revision: 0 },
      async () => new Response(JSON.stringify({
        avatar: { presetId: LOADOUT.bodyId, revision: 1 }
      }), { status: 200 })
    ),
    /confirm your saved avatar/
  )
})
