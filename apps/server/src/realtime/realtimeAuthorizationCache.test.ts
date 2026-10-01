import assert from "node:assert/strict"
import test from "node:test"
import {
  createRealtimeAuthorizationCache,
  forEachWithConcurrency,
  REALTIME_AUTHORIZATION_BATCH_SIZE,
  REALTIME_AUTHORIZATION_CACHE_TTL_MS,
  REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY,
  REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS
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

// Revocations are event-driven (see realtimeServer tests); the TTL only bounds
// changes no instance announces, and the sweep refreshes live connections
// before their entry expires so the hot path never waits for the database.
test("the backstop bound is at most one minute and longer than the sweep interval", () => {
  assert.ok(REALTIME_AUTHORIZATION_CACHE_TTL_MS > 0)
  assert.ok(REALTIME_AUTHORIZATION_CACHE_TTL_MS <= 60_000)
  assert.ok(REALTIME_AUTHORIZATION_SWEEP_INTERVAL_MS < REALTIME_AUTHORIZATION_CACHE_TTL_MS)
})

test("an upgrade-time decision is recorded unless that user was revoked meanwhile", async () => {
  const clock = createClock()
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: clock.now,
    async check() { checks += 1; return false }
  })
  const other = { userId: "user_2", sessionFamilyId: "family_2" }
  const observation = cache.observe()
  cache.invalidate({ kind: "user", userId: FAMILY.userId })
  cache.recordAllowed(FAMILY, observation)
  cache.recordAllowed(other, observation)
  // The revoked user's pre-revocation answer is discarded and re-checked...
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(checks, 1)
  // ...while another user's concurrent upgrade is unaffected.
  assert.equal(await cache.authorize(other), true)
  assert.equal(checks, 1)
  const afterEveryone = cache.observe()
  cache.invalidate({ kind: "all" })
  cache.recordAllowed(other, afterEveryone)
  assert.equal(await cache.authorize(other), false)
})

test("a cached decision never outlives the session family's own expiry", async () => {
  const clock = createClock()
  let checks = 0
  const cache = createRealtimeAuthorizationCache({
    now: clock.now,
    async check() { checks += 1; return false },
    async checkMany(batch) { return batch.map(() => ({ allowed: true, notAfter: clock.now() + 5_000 })) }
  })
  cache.recordAllowed(FAMILY, cache.observe(), clock.now() + 1_000)
  clock.advance(999)
  assert.equal(await cache.authorize(FAMILY), true)
  clock.advance(1)
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(checks, 1)
  const other = { userId: "user_2", sessionFamilyId: "family_2" }
  assert.deepEqual(await cache.refresh([other]), [])
  clock.advance(4_999)
  assert.equal(await cache.authorize(other), true)
  clock.advance(1)
  assert.equal(await cache.authorize(other), false)
  // An already expired family is never stored.
  cache.recordAllowed(FAMILY, cache.observe(), clock.now())
  assert.equal(await cache.authorize(FAMILY), false)
})

test("a decision observed longer ago than the stamp window is never recorded", async () => {
  const clock = createClock()
  const cache = createRealtimeAuthorizationCache({ now: clock.now, async check() { return false } })
  const observation = cache.observe()
  clock.advance(60_001)
  cache.recordAllowed(FAMILY, observation)
  assert.equal(await cache.authorize(FAMILY), false)
})

test("refresh checks identities in batches and reports the denied ones", async () => {
  const clock = createClock()
  const batches: number[] = []
  let singleChecks = 0
  const identities = Array.from({ length: REALTIME_AUTHORIZATION_BATCH_SIZE + 3 }, (_, index) => ({
    userId: `user_${index}`, sessionFamilyId: `family_${index}`
  }))
  const cache = createRealtimeAuthorizationCache({
    now: clock.now,
    async check() { singleChecks += 1; return false },
    async checkMany(batch) {
      batches.push(batch.length)
      return batch.map((identity) => identity.userId !== "user_1")
    }
  })
  const denied = await cache.refresh([...identities, identities[0]!])
  assert.deepEqual(batches, [REALTIME_AUTHORIZATION_BATCH_SIZE, 3])
  assert.deepEqual(denied, [identities[1]])
  assert.equal(cache.size(), identities.length - 1)
  // Refreshed entries serve the hot path without a query until the TTL.
  clock.advance(REALTIME_AUTHORIZATION_CACHE_TTL_MS - 1)
  assert.equal(await cache.authorize(identities[0]!), true)
  assert.equal(singleChecks, 0)
  clock.advance(1)
  assert.equal(await cache.authorize(identities[0]!), false)
  assert.equal(singleChecks, 1)
})

test("refresh drops a denied identity's cached decision at once", async () => {
  let allowed = true
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check() { return allowed },
    async checkMany(batch) { return batch.map(() => allowed) }
  })
  assert.equal(await cache.authorize(FAMILY), true)
  allowed = false
  assert.deepEqual(await cache.refresh([FAMILY]), [FAMILY])
  assert.equal(await cache.authorize(FAMILY), false)
})

test("a revocation during a batched refresh is not overwritten by its answer", async () => {
  const gate = deferred<boolean[]>()
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check() { return false },
    checkMany: () => gate.promise
  })
  const other = { userId: "user_2", sessionFamilyId: "family_2" }
  const refreshing = cache.refresh([FAMILY, other])
  await Promise.resolve()
  cache.invalidate({ kind: "user", userId: FAMILY.userId })
  gate.resolve([true, true])
  assert.deepEqual(await refreshing, [])
  assert.equal(await cache.authorize(FAMILY), false)
  assert.equal(await cache.authorize(other), true)
})

test("a failed batched refresh rejects and leaves decisions to expire within the TTL", async () => {
  const clock = createClock()
  let allowed = true
  const cache = createRealtimeAuthorizationCache({
    now: clock.now,
    async check() { return allowed },
    async checkMany() { throw new Error("authorization store unavailable") }
  })
  assert.equal(await cache.authorize(FAMILY), true)
  await assert.rejects(cache.refresh([FAMILY]), /authorization store unavailable/)
  allowed = false
  assert.equal(await cache.authorize(FAMILY), true)
  clock.advance(REALTIME_AUTHORIZATION_CACHE_TTL_MS)
  assert.equal(await cache.authorize(FAMILY), false)
})

test("refresh without a batched check falls back to bounded single checks", async () => {
  let active = 0
  let maxActive = 0
  const identities = Array.from({ length: REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY + 4 }, (_, index) => ({
    userId: `user_${index}`, sessionFamilyId: `family_${index}`
  }))
  const cache = createRealtimeAuthorizationCache({
    now: createClock().now,
    async check(identity) {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => setImmediate(resolve))
      active -= 1
      return identity.userId !== "user_0"
    }
  })
  assert.deepEqual(await cache.refresh(identities), [identities[0]])
  assert.ok(maxActive <= REALTIME_AUTHORIZATION_SWEEP_CONCURRENCY)
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
