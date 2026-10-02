import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoverProfileResponse } from "./discoveryApi"
import {
  DISCOVER_PROFILE_CACHE_LIMIT,
  forgetDiscoverProfile,
  loadDiscoverProfile,
  readCachedDiscoverProfile,
  warmDiscoverProfile
} from "./discoverProfileCache"

function response(userId: string): DiscoverProfileResponse {
  return { profile: { userId } } as unknown as DiscoverProfileResponse
}

function deferred() {
  let resolve!: (value: DiscoverProfileResponse) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<DiscoverProfileResponse>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test("a profile is cached per signed-in account, never across accounts", async () => {
  await loadDiscoverProfile({ viewerUserId: "viewer-a", userId: "p-1" }, async () => response("p-1"))
  assert.ok(readCachedDiscoverProfile({ viewerUserId: "viewer-a", userId: "p-1" }))
  assert.equal(readCachedDiscoverProfile({ viewerUserId: "viewer-b", userId: "p-1" }), undefined)
  forgetDiscoverProfile({ viewerUserId: "viewer-a", userId: "p-1" })
  assert.equal(readCachedDiscoverProfile({ viewerUserId: "viewer-a", userId: "p-1" }), undefined)
})

test("a screen shares a running warmup instead of starting a second request", async () => {
  const key = { viewerUserId: "viewer-a", userId: "p-2" }
  const warm = deferred()
  let loads = 0
  warmDiscoverProfile(key, () => { loads += 1; return warm.promise })
  warmDiscoverProfile(key, () => { loads += 1; return warm.promise })
  const opened = loadDiscoverProfile(key, () => { loads += 1; return deferred().promise }, new AbortController().signal)
  assert.equal(loads, 1)
  warm.resolve(response("p-2"))
  assert.equal((await opened).profile.userId, "p-2")
  // Once cached, a warmup does nothing.
  warmDiscoverProfile(key, () => { loads += 1; return warm.promise })
  assert.equal(loads, 1)
})

test("a screen's abortable request is never shared, so aborting it fails no one else", async () => {
  const key = { viewerUserId: "viewer-a", userId: "p-3" }
  const first = deferred()
  const second = deferred()
  const pending = [first, second]
  const loadNext = () => pending.shift()!.promise
  const aborted = loadDiscoverProfile(key, loadNext, new AbortController().signal)
  const other = loadDiscoverProfile(key, loadNext, new AbortController().signal)
  first.reject(new Error("aborted"))
  await assert.rejects(aborted)
  second.resolve(response("p-3"))
  assert.equal((await other).profile.userId, "p-3")
})

test("a failed warmup stays silent and leaves nothing cached", async () => {
  const key = { viewerUserId: "viewer-a", userId: "p-4" }
  warmDiscoverProfile(key, async () => { throw new Error("offline") })
  await flush()
  assert.equal(readCachedDiscoverProfile(key), undefined)
})

test("the oldest profile leaves first once the cache is full", async () => {
  for (let index = 0; index <= DISCOVER_PROFILE_CACHE_LIMIT; index += 1) {
    await loadDiscoverProfile({ viewerUserId: "viewer-c", userId: `q-${index}` }, async () => response(`q-${index}`))
  }
  assert.equal(readCachedDiscoverProfile({ viewerUserId: "viewer-c", userId: "q-0" }), undefined)
  assert.ok(readCachedDiscoverProfile({ viewerUserId: "viewer-c", userId: `q-${DISCOVER_PROFILE_CACHE_LIMIT}` }))
})
