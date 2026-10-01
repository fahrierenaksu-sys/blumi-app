import assert from "node:assert/strict"
import test from "node:test"
import { fetchChatPreferences, saveChatPreferences } from "./chatPreferencesApi"
import { registerBoundedRequestTests } from "../network/boundedRequestContract"

registerBoundedRequestTests([
  {
    name: "chat preferences GET",
    run: (fetcher) => fetchChatPreferences("https://api.blumi.test", "token", fetcher)
  },
  {
    name: "chat preferences PUT",
    run: (fetcher) => saveChatPreferences("https://api.blumi.test", "token", { readReceiptsEnabled: true }, fetcher)
  }
])

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

test("the read receipts setting loads with its availability", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const state = await fetchChatPreferences("https://api.blumi.test", "token", async (url, init) => {
    calls.push({ url: String(url), init })
    return json(200, { preferences: { readReceiptsEnabled: true }, available: true })
  })
  assert.deepEqual(state, { preferences: { readReceiptsEnabled: true }, available: true })
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/chat-preferences")
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer token")
})

test("a server without the route makes the setting unavailable, not an error", async () => {
  const state = await fetchChatPreferences("https://api.blumi.test", "token", async () => json(404, { error: "Not Found" }))
  assert.deepEqual(state, { preferences: { readReceiptsEnabled: false }, available: false })
  await assert.rejects(fetchChatPreferences("https://api.blumi.test", "token", async () => json(500, {})))
  await assert.rejects(fetchChatPreferences("https://api.blumi.test", "token", async () => json(200, { preferences: {} })))
})

test("saving sends exactly the one boolean and returns the stored value", async () => {
  let body: unknown
  const saved = await saveChatPreferences("https://api.blumi.test", "token", { readReceiptsEnabled: false }, async (_url, init) => {
    assert.equal(init?.method, "PUT")
    body = JSON.parse(String(init?.body))
    return json(200, { preferences: { readReceiptsEnabled: false }, available: true })
  })
  assert.deepEqual(body, { readReceiptsEnabled: false })
  assert.deepEqual(saved, { readReceiptsEnabled: false })
  await assert.rejects(saveChatPreferences("https://api.blumi.test", "token", { readReceiptsEnabled: true },
    async () => json(409, { code: "CHAT_RECEIPTS_UNAVAILABLE", error: "Read receipts are not available yet." })))
})
