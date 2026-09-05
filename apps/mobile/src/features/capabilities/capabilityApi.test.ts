import assert from "node:assert/strict"
import test from "node:test"
import { CAPABILITY_KEYS } from "@blumi/contracts"
import {
  createFailClosedCapabilityResolution,
  getSessionScopedCapabilities,
  resolveProductionCapabilities,
  SUPPORTED_MOBILE_CAPABILITIES
} from "./capabilityApi"

test("mobile declares the complete avatar and Shop rollout surface", () => {
  assert.deepEqual(SUPPORTED_MOBILE_CAPABILITIES, [
    "avatar_loadout_v2_read",
    "avatar_loadout_v2_write",
    "shop_multi_item_apply",
    "discovery_public_profile",
    "discovery_badges",
    "discovery_room_showcase"
  ])
})

test("capability API declares supported keys and accepts a complete server map", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const capabilities = Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, key === "avatar_loadout_v2_read"])
  )

  const result = await resolveProductionCapabilities(
    "https://api.blumi.test/",
    "session-token",
    ["avatar_loadout_v2_read"],
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ legacy: false, capabilities }), {
        status: 200
      })
    }
  )

  assert.equal(result.capabilities.avatar_loadout_v2_read, true)
  assert.equal(result.capabilities.avatar_loadout_v2_write, false)
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/capabilities/resolve")
  assert.equal(calls[0]?.init?.method, "POST")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session-token"
  )
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    declaredCapabilities: ["avatar_loadout_v2_read"]
  })
})

test("capability API fails closed on network, HTTP, and malformed response failures", async () => {
  const expected = createFailClosedCapabilityResolution()
  const fetchers: typeof fetch[] = [
    async () => { throw new Error("network") },
    async () => new Response(JSON.stringify({ error: "no" }), { status: 503 }),
    async () => new Response(JSON.stringify({
      legacy: false,
      capabilities: { avatar_loadout_v2_read: true }
    }), { status: 200 })
  ]

  for (const fetcher of fetchers) {
    assert.deepEqual(
      await resolveProductionCapabilities(
        "https://api.blumi.test",
        "session-token",
        ["avatar_loadout_v2_read"],
        fetcher
      ),
      expected
    )
  }
})

test("fail-closed capability resolutions are complete and immutable", () => {
  const resolution = createFailClosedCapabilityResolution()
  assert.equal(resolution.legacy, true)
  assert.deepEqual(Object.keys(resolution.capabilities), [...CAPABILITY_KEYS])
  assert.equal(Object.values(resolution.capabilities).every((value) => !value), true)
  assert.equal(Object.isFrozen(resolution), true)
  assert.equal(Object.isFrozen(resolution.capabilities), true)
})

test("capabilities never leak across production session tokens", () => {
  const enabled = {
    ...createFailClosedCapabilityResolution().capabilities,
    shop_multi_item_apply: true
  }
  assert.equal(
    getSessionScopedCapabilities("session-b", {
      sessionToken: "session-a",
      capabilities: enabled
    }).shop_multi_item_apply,
    false
  )
  assert.equal(
    getSessionScopedCapabilities("session-a", {
      sessionToken: "session-a",
      capabilities: enabled
    }).shop_multi_item_apply,
    true
  )
})
