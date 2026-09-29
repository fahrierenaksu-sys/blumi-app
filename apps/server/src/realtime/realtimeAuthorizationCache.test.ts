import assert from "node:assert/strict"
import test from "node:test"
import {
  createRealtimeAuthorizationCache,
  forEachWithConcurrency,
  REALTIME_AUTHORIZATION_CACHE_TTL_MS
} from "./realtimeAuthorizationCache"

const FAMILY = { userId: "user_1", sessionFamilyId: "family_1" }

function createClock(start = 1_000_000) {
  let now = start
  return { now: () => now, advance(ms: number) { now += ms } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test("the documented staleness bound is at most five seconds", () => {
  assert.ok(REALTIME_AUTHORIZATION_CACHE_TTL_MS > 0)
  assert.ok(REALTIME_AUTHORIZATION_CACHE_TTL_MS <= 5_000)
})

test("a positive result is reused only until the TTL measured from the check start", async () => {
  const clock = createClock()
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: clock.now,
    async check() { checks += 1; clock.advance(100); return true }
  })
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(checks, 1)
  clock.advance(REALTIME_AUTHORIZATION_CACHE_TTL_MS - 101)
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(checks, 1)
  // The window started when the query started, so query latency does not extend it.
  clock.advance(1)
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(checks, 2)
})

test("session families are cached independently", async () => {
  const seen: string[] = []
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check(identity) { seen.push(identity.sessionFamilyId); return identity.userId === "user_1" && identity.sessionFamilyId === "family_1" }
  })
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(await cache.authorize({ ...FAMILY, sessionFamilyId: "family_2" }), false)
  assert.equal(await cache.authorize({ userId: "user_2", sessionFamilyId: "family_1" }), false)
  assert.deepEqual(seen, ["family_1", "family_2", "family_1"])
})

test("denials and errors are never cached and errors propagate so callers fail closed", async () => {
  let result: boolean | Error = false
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check() {
      checks += 1
      if (result instanceof Error) throw result
      return result
    }
  })
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(checks, 2)
  result = new Error("authorization store unavailable")
  await assert.rejects(cache.authorize(FAMILY), /authorization store unavailable/)
  await assert.rejects(cache.authorize(FAMILY), /authorization store unavailable/)
  assert.equal(checks, 4)
  result = true
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(checks, 5)
})

test("a synchronous check failure rejects instead of throwing", async () => {
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    check() { throw new Error("sync failure") }
  })
  await assert.rejects(cache.authorize(FAMILY), /sync failure/)
})

test("concurrent checks for one session family share a single query", async () => {
  const gate = deferred<boolean>()
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    check() { checks += 1; return gate.promise }
  })
  const results = Promise.all(Array.from({ length: 20 }, () => cache.authorize(FAMILY)))
  gate.resolve(true)
  assert.deepEqual(await results, Array.from({ length: 20 }, () => true))
  assert.equal(checks, 1)
})

test("a shared failing query fails every waiter closed", async () => {
  const gate = deferred<boolean>()
  const cache = createRealtimeAuthorizationCache({ now: createClock().now, check: () => gate.promise })
  const waiters = Array.from({ length: 3 }, () => cache.authorize(FAMILY))
  gate.reject(new Error("down"))
  for (const waiter of waiters) await assert.rejects(waiter, /down/)
})

test("invalidation drops the cached result for that user immediately", async () => {
  let allowed = true
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check() { checks += 1; return allowed }
  })
  const other = { userId: "user_2", sessionFamilyId: "family_9" }
  assert.equal(await cache.authorize(FAMILY), true)
  assert.equal(await cache.authorize(other), true)
  allowed = false
  cache.invalidate({ kind: "user", userId: "user_1" })
  assert.equal(await cache.authorize(FAMILY), false)
  // Unrelated users keep their bounded cache entry.
  assert.equal(await cache.authorize(other), true)
  assert.equal(checks, 3)
  cache.invalidate({ kind: "all" })
  assert.equal(await cache.authorize(other), false)
})

test("a check that started before an invalidation is neither cached nor joined afterwards", async () => {
  const first = deferred<boolean>()
  const second = deferred<boolean>()
  const pending = [first, second]
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    check() { checks += 1; return pending.shift()!.promise }
  })
  const beforeRevocation = cache.authorize(FAMILY)
  await Promise.resolve()
  cache.invalidate({ kind: "user", userId: FAMILY.userId })
  const afterRevocation = cache.authorize(FAMILY)
  first.resolve(true)
  second.resolve(false)
  assert.equal(await beforeRevocation, true)
  assert.equal(await afterRevocation, false)
  assert.equal(checks, 2)
  // The pre-revocation positive answer must not have been stored.
  const third = deferred<boolean>()
  third.resolve(false)
  pending.push(third)
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(checks, 3)
})

test("purgeExpired removes stale entries", async () => {
  const clock = createClock()
  let checks = 0
  const cache = createRealtimeAuthorizationCache({ now: clock.now, async check() { checks += 1; return true } })
  await cache.authorize(FAMILY)
  assert.equal(cache.size(), 1)
  clock.advance(REALTIME_AUTHORIZATION_CACHE_TTL_MS)
  cache.purgeExpired()
  assert.equal(cache.size(), 0)
})

test("forEachWithConcurrency never exceeds its bound and visits every item", async () => {
  let active = 0
  let maxActive = 0
  const visited: number[] = []
  await forEachWithConcurrency(Array.from({ length: 25 }, (_, index) => index), 4, async (item) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise<void>((resolve) => setImmediate(resolve))
    visited.push(item)
    active -= 1
  })
  assert.equal(maxActive, 4)
  assert.deepEqual(visited.sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index))
})

test("forEachWithConcurrency keeps going after a task failure", async () => {
  const visited: number[] = []
  await forEachWithConcurrency([1, 2, 3], 2, async (item) => {
    if (item === 1) throw new Error("boom")
    visited.push(item)
  })
  assert.deepEqual(visited.sort(), [2, 3])
})
