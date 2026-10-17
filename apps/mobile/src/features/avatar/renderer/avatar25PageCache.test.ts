import assert from "node:assert/strict"
import test from "node:test"
import {
  releaseAvatar25PagesToCache,
  retainAvatar25Pages,
  type Avatar25PageCache,
  type Avatar25PageCacheTimers
} from "./avatar25PageCache"

function fakeTimers() {
  const pending = new Map<number, () => void>()
  let next = 1
  const timers: Avatar25PageCacheTimers = {
    setTimeout: (callback) => {
      const id = next++
      pending.set(id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout: (timer) => {
      pending.delete(timer as unknown as number)
    }
  }
  const fireAll = () => {
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach((callback) => callback())
  }
  return { timers, fireAll }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function cacheWith(keys: string[]): { cache: Avatar25PageCache<string>; disposed: string[] } {
  const cache: Avatar25PageCache<string> = new Map(keys.map((key) => [key, { promise: Promise.resolve(key), refs: 1 }]))
  return { cache, disposed: [] }
}

test("an avatar coming back within the idle grace reuses its pages instead of loading them again", async () => {
  const { timers, fireAll } = fakeTimers()
  const { cache, disposed } = cacheWith(["girl"])
  releaseAvatar25PagesToCache(cache, "girl", (value) => disposed.push(value), { timers })
  assert.ok(cache.has("girl"), "the pages stay while nobody uses them")
  retainAvatar25Pages(cache.get("girl")!, timers)
  fireAll()
  await flush()
  assert.deepEqual(disposed, [])
  assert.equal(cache.get("girl")?.refs, 1)
})

test("pages nobody takes back are freed when the idle grace ends", async () => {
  const { timers, fireAll } = fakeTimers()
  const { cache, disposed } = cacheWith(["girl"])
  releaseAvatar25PagesToCache(cache, "girl", (value) => disposed.push(value), { timers })
  fireAll()
  await flush()
  assert.equal(cache.has("girl"), false)
  assert.deepEqual(disposed, ["girl"])
})

test("pages still used by another avatar are never freed", async () => {
  const { timers, fireAll } = fakeTimers()
  const { cache, disposed } = cacheWith(["girl"])
  retainAvatar25Pages(cache.get("girl")!, timers)
  releaseAvatar25PagesToCache(cache, "girl", (value) => disposed.push(value), { timers })
  fireAll()
  await flush()
  assert.equal(cache.get("girl")?.refs, 1)
  assert.deepEqual(disposed, [])
})

test("only a few idle page sets are kept; the oldest goes first", async () => {
  const { timers } = fakeTimers()
  const { cache, disposed } = cacheWith(["a", "b", "c"])
  for (const key of ["a", "b", "c"]) releaseAvatar25PagesToCache(cache, key, (value) => disposed.push(value), { timers, maxIdle: 2 })
  await flush()
  assert.deepEqual(disposed, ["a"])
  assert.deepEqual([...cache.keys()].sort(), ["b", "c"])
})
