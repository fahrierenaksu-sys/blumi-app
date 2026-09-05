import assert from "node:assert/strict"
import test from "node:test"
import { updateRoomShowcaseVisibility } from "./roomShowcaseApi"

test("room showcase publishes the requested headline and revision", async () => {
  let request: RequestInit | undefined
  const result = await updateRoomShowcaseVisibility(
    "https://api.blumi.test/",
    "session-token",
    { isPublic: true, headline: "Kahve ve sohbet" },
    async (_url, init) => {
      request = init
      return new Response(JSON.stringify({
        roomShowcase: {
          isPublic: true,
          headline: "Kahve ve sohbet",
          roomRevision: 12
        }
      }), { status: 200 })
    }
  )

  assert.deepEqual(result, {
    isPublic: true,
    headline: "Kahve ve sohbet",
    roomRevision: 12
  })
  assert.equal(request?.method, "PUT")
  assert.match(
    String((request?.headers as Record<string, string>)[
      "x-blumi-client-capabilities"
    ]),
    /discovery_room_showcase/
  )
  assert.deepEqual(JSON.parse(String(request?.body)), {
    isPublic: true,
    headline: "Kahve ve sohbet"
  })
})

test("room showcase fails closed on malformed server state", async () => {
  await assert.rejects(
    () => updateRoomShowcaseVisibility(
      "https://api.blumi.test",
      "session-token",
      { isPublic: false, headline: null },
      async () => new Response(JSON.stringify({
        roomShowcase: { isPublic: false, headline: null, roomRevision: 0 }
      }), { status: 200 })
    ),
    /doğrulayamadı/
  )
})
