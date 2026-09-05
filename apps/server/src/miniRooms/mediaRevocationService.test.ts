import assert from "node:assert/strict"
import test from "node:test"
import { createLivekitRevocationProvider } from "./mediaRevocationService"

test("server media removal uses scoped admin token and bounded request", async () => {
  let payload: unknown
  const provider = createLivekitRevocationProvider({ livekitUrl: "wss://example.livekit.cloud", apiKey: "key", apiSecret: "synthetic",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://example.livekit.cloud/twirp/livekit.RoomService/RemoveParticipant")
      assert.ok(init?.signal)
      payload = JSON.parse(String(init?.body))
      const token = String((init?.headers as Record<string, string>).authorization).slice(7)
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
      assert.deepEqual(claims.video, { roomAdmin: true, room: "room" })
      return new Response("{}")
    }
  })
  await provider.removeParticipant("room", "user")
  assert.deepEqual(payload, { room: "room", identity: "user" })
})

test("generic proxy404 must not acknowledge revocation", async () => {
  const provider = createLivekitRevocationProvider({ livekitUrl: "wss://example.livekit.cloud", apiKey: "key", apiSecret: "synthetic",
    fetcher: async () => new Response("proxy not found", { status: 404 }) })
  await assert.rejects(provider.removeParticipant("room", "user"), /removal failed/)
})
