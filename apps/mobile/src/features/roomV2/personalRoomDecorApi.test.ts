import assert from "node:assert/strict"
import test from "node:test"
import {
  fetchPersonalRoomDecor,
  savePersonalRoomDecor,
  savePersonalRoomDecorReplacingCurrent
} from "./personalRoomDecorApi"

const DECOR = {
  roomShellId: "room_v3_blush_petal_cottage",
  placedItems: [{
    instanceId: "chair-1",
    itemId: "room_v2_chair_blush",
    x: 0.5,
    y: 0.72,
    rotation: "front" as const
  }]
}

const SNAPSHOT = {
  userId: "user_1",
  revision: 2,
  decor: DECOR,
  updatedAt: "2026-07-26T12:00:00.000Z"
}

test("personal Room API reads and saves an authenticated revision snapshot", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const loaded = await fetchPersonalRoomDecor(
    "https://api.blumi.test/",
    "session-token",
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ roomDecor: SNAPSHOT }), {
        status: 200
      })
    }
  )
  assert.deepEqual(loaded, SNAPSHOT)

  const saved = await savePersonalRoomDecor(
    "https://api.blumi.test",
    "session-token",
    { expectedRevision: 2, decor: DECOR },
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        roomDecor: { ...SNAPSHOT, revision: 3 }
      }), { status: 200 })
    }
  )
  assert.equal(saved.kind, "saved")
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/users/me/room-decor")
  assert.equal(calls[1]?.init?.method, "PUT")
  assert.equal(
    (calls[1]?.init?.headers as Record<string, string>).authorization,
    "Bearer session-token"
  )
})

test("onboarding replaces the server starter room using its current revision", async () => {
  const requests: { method: string; body?: unknown }[] = []
  const result = await savePersonalRoomDecorReplacingCurrent(
    "https://api.blumi.test",
    "session-token",
    DECOR,
    async (_url, init) => {
      const method = init?.method ?? "GET"
      requests.push({
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      })
      if (method === "GET") {
        return new Response(JSON.stringify({ roomDecor: SNAPSHOT }), { status: 200 })
      }
      return new Response(JSON.stringify({
        roomDecor: { ...SNAPSHOT, revision: 3, decor: DECOR }
      }), { status: 200 })
    }
  )

  assert.equal(result.kind, "saved")
  assert.deepEqual(requests, [
    { method: "GET", body: undefined },
    { method: "PUT", body: { expectedRevision: 2, decor: DECOR } }
  ])
})

test("personal Room API returns canonical state on conflict and rejects malformed data", async () => {
  const conflict = await savePersonalRoomDecor(
    "https://api.blumi.test",
    "session-token",
    { expectedRevision: 1, decor: DECOR },
    async () => new Response(JSON.stringify({
      code: "ROOM_DECOR_REVISION_CONFLICT",
      current: SNAPSHOT
    }), { status: 409 })
  )
  assert.equal(conflict.kind, "conflict")

  await assert.rejects(
    fetchPersonalRoomDecor(
      "https://api.blumi.test",
      "session-token",
      async () => new Response(JSON.stringify({
        roomDecor: { revision: "two", decor: {} }
      }), { status: 200 })
    ),
    /room layout safely/i
  )
})
