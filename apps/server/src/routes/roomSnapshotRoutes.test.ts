import test from "node:test"
import assert from "node:assert/strict"
import Fastify from "fastify"
import { registerRoomSnapshotRoutes } from "./roomSnapshotRoutes"
import { createOpenApiDocument, type OpenApiRouteSnapshot } from "../openapi/openapiDocument"

test("room showcase asset route serves public snapshots and fails closed", async () => {
  const app = Fastify()
  const routes: OpenApiRouteSnapshot[] = []
  app.addHook("onRoute", (route) => { routes.push(route) })
  const assetKey = "c".repeat(64)
  let isPublic = true
  await registerRoomSnapshotRoutes(app, {
    authService: null as never,
    personalRoomDecorService: null as never,
    roomSnapshotService: {
      findByAssetKey: async (key) => key === assetKey
        ? {
            userId: "user_1",
            roomRevision: 3,
            assetKey,
            mimeType: "image/webp",
            rendererVersion: "room-snapshot-v1",
            body: Buffer.from("webp-bytes"),
            isPublic,
            headline: null,
            updatedAt: "2026-08-14T12:00:00.000Z"
          }
        : null,
      getLatestForUser: async () => null,
      publishForRoomSave: async () => {
        throw new Error("not used")
      },
      setVisibilityForRoom: async () => null
    }
  })

  const response = await app.inject({
    method: "GET",
    url: `/v1/room-showcase/${assetKey}`
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers["content-type"], "image/webp")
  assert.equal(response.body, "webp-bytes")
  assert.equal(response.headers["cache-control"], "no-store")
  const operation = createOpenApiDocument(routes).paths["/v1/room-showcase/{assetKey}"]!.get!
  assert.equal(operation.security, undefined)
  const responses = operation.responses as Record<string, { content?: Record<string, unknown> }>
  assert.ok(responses["200"]?.content?.["image/webp"])
  assert.ok(responses["404"])
  assert.equal(responses["401"], undefined)

  const missing = await app.inject({
    method: "GET",
    url: `/v1/room-showcase/${"d".repeat(64)}`
  })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.headers["cache-control"], "no-store")
  isPublic = false
  const hidden = await app.inject({ method: "GET", url: `/v1/room-showcase/${assetKey}` })
  assert.equal(hidden.statusCode, 404)
  assert.equal(hidden.headers["cache-control"], "no-store")
  await app.close()
})

test("room showcase publish endpoint requires the current saved room and validates headline", async () => {
  const app = Fastify()
  const calls: Array<{ isPublic: boolean; headline: string | null }> = []
  await registerRoomSnapshotRoutes(app, {
    authService: {
      getSession: async (token: string) => token === "session"
        ? {
            account: {
              userId: "user_1",
              updatedAt: "2026-08-14T12:00:00.000Z",
              moderation: { status: "active", updatedAt: "2026-08-14T12:00:00.000Z" }
            }
          } as never
        : null
    } as never,
    personalRoomDecorService: {
      get: async () => ({
        userId: "user_1",
        revision: 4,
        decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    } as never,
    roomSnapshotService: {
      findByAssetKey: async () => null,
      getLatestForUser: async () => null,
      publishForRoomSave: async () => { throw new Error("not used") },
      setVisibilityForRoom: async ({ isPublic, headline }) => {
        calls.push({ isPublic, headline: headline ?? null })
        return {
          userId: "user_1",
          roomRevision: 4,
          assetKey: "e".repeat(64),
          mimeType: "image/webp",
          rendererVersion: "room-snapshot-v1",
          body: Buffer.from("snapshot"),
          isPublic,
          headline: headline ?? null,
          updatedAt: "2026-08-14T12:00:00.000Z"
        }
      }
    }
  })

  const response = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-showcase",
    headers: { authorization: "Bearer session" },
    payload: { isPublic: true, headline: "  Kahve   ve sohbet  " }
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{ isPublic: true, headline: "Kahve ve sohbet" }])
  assert.equal(response.json().roomShowcase.headline, "Kahve ve sohbet")

  const invalid = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-showcase",
    headers: { authorization: "Bearer session" },
    payload: { isPublic: true, headline: "Odam 🏡" }
  })
  assert.equal(invalid.statusCode, 400)
  assert.equal(calls.length, 1)
  for (const payload of [{}, { isPublic: {} }, { isPublic: [] }, { isPublic: null }, { isPublic: "true" }, { isPublic: 1 }, { isPublic: true, extra: true }, { isPublic: true, headline: "a".repeat(121) }, [], null]) {
    const rejected = await app.inject({
      method: "PUT", url: "/v1/users/me/room-showcase",
      headers: { authorization: "Bearer session", "content-type": "application/json" },
      payload: JSON.stringify(payload)
    })
    assert.equal(rejected.statusCode, 400, JSON.stringify(payload))
    assert.equal(calls.length, 1)
  }
  const privateResponse = await app.inject({
    method: "PUT", url: "/v1/users/me/room-showcase",
    headers: { authorization: "Bearer session" }, payload: { isPublic: false, headline: null }
  })
  assert.equal(privateResponse.statusCode, 200)
  assert.deepEqual(calls[1], { isPublic: false, headline: null })
  await app.close()

  const blockedApp = Fastify()
  await registerRoomSnapshotRoutes(blockedApp, {
    authService: {
      getSession: async () => ({
        account: {
          userId: "user_1",
          updatedAt: "2026-08-14T12:00:00.000Z",
          moderation: { status: "active", updatedAt: "2026-08-14T12:00:00.000Z" }
        }
      })
    } as never,
    personalRoomDecorService: {
      get: async () => ({
        userId: "user_1",
        revision: 4,
        decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    } as never,
    roomSnapshotService: {
      findByAssetKey: async () => null,
      getLatestForUser: async () => null,
      publishForRoomSave: async () => { throw new Error("not used") },
      setVisibilityForRoom: async () => { throw new Error("must remain gated") }
    } as never,
    capabilityService: {
      resolve: () => ({
        legacy: false,
        capabilities: { discovery_room_showcase: false }
      })
    } as never
  })
  const blocked = await blockedApp.inject({
    method: "PUT",
    url: "/v1/users/me/room-showcase",
    headers: { authorization: "Bearer session" },
    payload: { isPublic: true, headline: "Kahve" }
  })
  assert.equal(blocked.statusCode, 404)
  await blockedApp.close()
})
