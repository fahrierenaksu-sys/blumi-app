import assert from "node:assert/strict"
import test from "node:test"
import { CAPABILITY_KEYS } from "@blumi/contracts"
import {
  createCapabilityResolutionSingleFlight,
  createFailClosedCapabilityResolution,
  getSessionScopedCapabilities,
  LATE_DECLARED_CAPABILITIES,
  resolveProductionCapabilities,
  SUPPORTED_MOBILE_CAPABILITIES
} from "./capabilityApi"

test("concurrent capability reads for one session share one request without caching", async () => {
  let requests = 0
  let finish: ((value: ReturnType<typeof createFailClosedCapabilityResolution>) => void) | undefined
  const resolve = createCapabilityResolutionSingleFlight(() => {
    requests += 1
    return new Promise((next) => { finish = next })
  })

  const first = resolve("session-a")
  const second = resolve("session-a")
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(requests, 1)

  finish?.(createFailClosedCapabilityResolution())
  await Promise.all([first, second])
  const later = resolve("session-a")
  await Promise.resolve()
  assert.equal(requests, 2)
  finish?.(createFailClosedCapabilityResolution())
  await later
})

test("capability reads never share across sessions or clear a newer flight", async () => {
  const completions = new Map<string, (value: ReturnType<typeof createFailClosedCapabilityResolution>) => void>()
  const resolve = createCapabilityResolutionSingleFlight((token) =>
    new Promise((next) => { completions.set(token, next) }))

  const old = resolve("session-a")
  const current = resolve("session-b")
  assert.equal(resolve("session-a"), old)
  await Promise.resolve()
  completions.get("session-a")?.(createFailClosedCapabilityResolution())
  await old
  assert.equal(resolve("session-b"), current)
  completions.get("session-b")?.(createFailClosedCapabilityResolution())
  await current
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

test("unresolved capabilities are one frozen object, so memoised pages keep equal props", () => {
  const unresolved = { sessionToken: null, capabilities: createFailClosedCapabilityResolution().capabilities }
  const first = getSessionScopedCapabilities(null, unresolved)
  assert.equal(getSessionScopedCapabilities(null, unresolved), first)
  assert.equal(getSessionScopedCapabilities("session-b", { ...unresolved, sessionToken: "session-a" }), first)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.values(first).every((value) => !value), true)
})

test("a stalled capability request fails closed instead of hanging", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] })
  let transportSignal: AbortSignal | null | undefined
  const resolution = resolveProductionCapabilities(
    "https://api.test",
    "session-token",
    SUPPORTED_MOBILE_CAPABILITIES,
    async (_url, init) => {
      transportSignal = init?.signal
      return new Promise<Response>(() => {})
    }
  )
  await Promise.resolve()
  context.mock.timers.tick(15_000)
  assert.deepEqual(await resolution, createFailClosedCapabilityResolution())
  assert.equal(transportSignal?.aborted, true)
})

test("mobile declares only known capabilities, each once", () => {
  assert.ok(SUPPORTED_MOBILE_CAPABILITIES.length > 0)
  assert.equal(new Set(SUPPORTED_MOBILE_CAPABILITIES).size, SUPPORTED_MOBILE_CAPABILITIES.length)
  for (const capability of SUPPORTED_MOBILE_CAPABILITIES) {
    assert.ok((CAPABILITY_KEYS as readonly string[]).includes(capability), capability)
  }
})

test("a build that draws the 2.5D avatar declares avatar_world_25d so the server can tell it from older builds", () => {
  assert.ok((SUPPORTED_MOBILE_CAPABILITIES as readonly string[]).includes("avatar_world_25d"))
})

test("an older server that refuses a late key keeps every other capability on, the late key off", async () => {
  // Arrange: the live server predates avatar_world_25d: it refuses the declaration (400) and leaves the key out
  const olderServerKeys = CAPABILITY_KEYS.filter((key) => !LATE_DECLARED_CAPABILITIES.includes(key))
  const bodies: unknown[] = []
  const olderServer: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { declaredCapabilities: string[] }
    bodies.push(body)
    if (body.declaredCapabilities.some((key) => LATE_DECLARED_CAPABILITIES.includes(key as never))) {
      return new Response(JSON.stringify({ error: "Declare valid client capabilities." }), { status: 400 })
    }
    return new Response(JSON.stringify({
      legacy: false,
      capabilities: Object.fromEntries(olderServerKeys.map((key) => [key, true]))
    }), { status: 200 })
  }

  // Act
  const result = await resolveProductionCapabilities(
    "https://api.blumi.test", "session-token", SUPPORTED_MOBILE_CAPABILITIES, olderServer
  )

  // Assert
  assert.equal(bodies.length, 2)
  assert.equal(result.capabilities.chat_typing, true)
  assert.equal(result.capabilities.chat_read_receipts, true)
  assert.equal(result.capabilities.avatar_world_25d, false)
})

test("a refused declaration without late keys, or a map missing an older key, still fails closed", async () => {
  const expected = createFailClosedCapabilityResolution()
  let calls = 0
  const refusing: typeof fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ error: "no" }), { status: 400 })
  }
  assert.deepEqual(
    await resolveProductionCapabilities("https://api.blumi.test", "session-token", ["chat_typing"], refusing),
    expected
  )
  assert.equal(calls, 1)

  const missingOlderKey: typeof fetch = async () => new Response(JSON.stringify({
    legacy: false,
    capabilities: Object.fromEntries(CAPABILITY_KEYS.filter((key) => key !== "chat_typing").map((key) => [key, true]))
  }), { status: 200 })
  assert.deepEqual(
    await resolveProductionCapabilities("https://api.blumi.test", "session-token", ["chat_typing"], missingOlderKey),
    expected
  )
})
