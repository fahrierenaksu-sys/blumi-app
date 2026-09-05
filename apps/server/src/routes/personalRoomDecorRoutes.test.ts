import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createPersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import { createServer } from "../server"

test("personal Room decor is available while the owner is completing onboarding", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const phoneNumber = "+905551110001"
  await authService.sendCode(phoneNumber)
  const signedIn = await authService.verifyCode(phoneNumber, "482931")
  const personalRoomDecorService = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"]
  })
  const app = createServer({ authService, personalRoomDecorService })
  const headers = {
    authorization: `Bearer ${signedIn.sessionToken}`
  }
  const decor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "onboarding-chair",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.72,
      rotation: "front"
    }]
  }

  const empty = await app.inject({
    method: "GET",
    url: "/v1/users/me/room-decor",
    headers
  })
  assert.equal(empty.statusCode, 200)
  assert.equal(empty.json().roomDecor, null)

  const saved = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-decor",
    headers,
    payload: { expectedRevision: 0, decor }
  })
  assert.equal(saved.statusCode, 200)
  assert.deepEqual(saved.json().roomDecor.decor, {
    schemaVersion: 3,
    geometryVersion: "room_v2",
    ...decor
  })

  await app.close()
})

test("personal Room decor is authenticated, ownership-bound, and revision-safe", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const phoneNumber = "+905551118877"
  await authService.sendCode(phoneNumber)
  const signedIn = await authService.verifyCode(phoneNumber, "482931")
  await authService.updateProfile(signedIn.sessionToken, {
    displayName: "Room Owner",
    age: 27,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(signedIn.sessionToken, step)
  }
  const personalRoomDecorService = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"]
  })
  const app = createServer({ authService, personalRoomDecorService })
  const headers = {
    authorization: `Bearer ${signedIn.sessionToken}`
  }
  const decor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "chair-1",
      itemId: "room_v2_chair_blush",
      x: 0.5,
      y: 0.72,
      rotation: "front"
    }]
  }

  const empty = await app.inject({
    method: "GET",
    url: "/v1/users/me/room-decor",
    headers
  })
  assert.equal(empty.statusCode, 200)
  assert.equal(empty.json().roomDecor, null)

  const saved = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-decor",
    headers,
    payload: { expectedRevision: 0, decor }
  })
  assert.equal(saved.statusCode, 200)
  assert.equal(saved.json().roomDecor.revision, 1)

  const stale = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-decor",
    headers,
    payload: {
      expectedRevision: 0,
      decor: {
        ...decor,
        placedItems: [{ ...decor.placedItems[0], x: 0.6 }]
      }
    }
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().code, "ROOM_DECOR_REVISION_CONFLICT")

  const unowned = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-decor",
    headers,
    payload: {
      expectedRevision: 1,
      decor: {
        ...decor,
        placedItems: [{
          ...decor.placedItems[0],
          itemId: "room_v2_cozy_bed"
        }]
      }
    }
  })
  assert.equal(unowned.statusCode, 400)

  await app.close()
})

test("personal Room routes reject missing sessions and isolate each account's layout", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const signIn = async (phoneNumber: string) => {
    await authService.sendCode(phoneNumber)
    return authService.verifyCode(phoneNumber, "482931")
  }
  const first = await signIn("+905551110101")
  const second = await signIn("+905551110202")
  const personalRoomDecorService = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async () => ["room_v2_chair_blush"]
  })
  const app = createServer({ authService, personalRoomDecorService })

  for (const headers of [
    undefined,
    { authorization: "Bearer invalid-session" }
  ]) {
    const response = await app.inject({
      method: "GET",
      url: "/v1/users/me/room-decor",
      ...(headers ? { headers } : {})
    })
    assert.equal(response.statusCode, 401)
  }

  const firstDecor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: "first-chair",
      itemId: "room_v2_chair_blush",
      x: 0.4,
      y: 0.72,
      rotation: "front"
    }]
  }
  const firstSaved = await app.inject({
    method: "PUT",
    url: "/v1/users/me/room-decor",
    headers: { authorization: `Bearer ${first.sessionToken}` },
    payload: {
      expectedRevision: 0,
      userId: second.account.userId,
      decor: firstDecor
    }
  })
  assert.equal(firstSaved.statusCode, 200)

  const secondEmpty = await app.inject({
    method: "GET",
    url: "/v1/users/me/room-decor",
    headers: { authorization: `Bearer ${second.sessionToken}` }
  })
  assert.equal(secondEmpty.statusCode, 200)
  assert.equal(secondEmpty.json().roomDecor, null)

  const firstLoaded = await app.inject({
    method: "GET",
    url: "/v1/users/me/room-decor",
    headers: { authorization: `Bearer ${first.sessionToken}` }
  })
  assert.equal(firstLoaded.statusCode, 200)
  assert.equal(firstLoaded.json().roomDecor.decor.placedItems[0].instanceId, "first-chair")

  await app.close()
})
