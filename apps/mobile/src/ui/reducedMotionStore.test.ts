import assert from "node:assert/strict"
import test from "node:test"
import { createReducedMotionStore, type ReducedMotionSource } from "./reducedMotionStore"

function createSource() {
  const queries: { resolve: (value: boolean) => void; reject: (error: Error) => void }[] = []
  const osListeners = new Set<(enabled: boolean) => void>()
  let removals = 0
  const source: ReducedMotionSource = {
    isReduceMotionEnabled: () =>
      new Promise<boolean>((resolve, reject) => { queries.push({ resolve, reject }) }),
    addEventListener: (_event, listener) => {
      osListeners.add(listener)
      return { remove: () => { removals += 1; osListeners.delete(listener) } }
    }
  }
  return {
    source,
    queries,
    osListeners,
    get removals() { return removals },
    emit: (enabled: boolean) => { for (const listener of osListeners) listener(enabled) }
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test("starts fail closed and unresolved", () => {
  const store = createReducedMotionStore(createSource().source)
  assert.deepEqual(store.getSnapshot(), { reduceMotion: true, isResolved: false })
})

test("many consumers share one OS query and one OS listener", async () => {
  const fake = createSource()
  const store = createReducedMotionStore(fake.source)
  let notifications = 0
  const unsubscribers = Array.from({ length: 30 }, () =>
    store.subscribe(() => { notifications += 1 }))

  assert.equal(fake.queries.length, 1)
  assert.equal(fake.osListeners.size, 1)
  fake.queries[0]!.resolve(false)
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceMotion: false, isResolved: true })
  assert.equal(notifications, 30)
  for (const unsubscribe of unsubscribers) unsubscribe()
  assert.equal(fake.removals, 1)
})

test("a later mount reads the resolved preference synchronously", async () => {
  const fake = createSource()
  const store = createReducedMotionStore(fake.source)
  const first = store.subscribe(() => undefined)
  fake.queries[0]!.resolve(false)
  await flush()

  const second = store.subscribe(() => undefined)
  assert.deepEqual(store.getSnapshot(), { reduceMotion: false, isResolved: true })
  assert.equal(fake.queries.length, 1)
  first()
  second()
})

test("OS changes reach every consumer and identical values do not re-notify", async () => {
  const fake = createSource()
  const store = createReducedMotionStore(fake.source)
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications += 1 })
  fake.queries[0]!.resolve(false)
  await flush()
  fake.emit(true)
  assert.equal(store.getSnapshot().reduceMotion, true)
  fake.emit(true)
  assert.equal(notifications, 2)
  unsubscribe()
})

test("a failed OS query resolves to reduced motion", async () => {
  const fake = createSource()
  const store = createReducedMotionStore(fake.source)
  const unsubscribe = store.subscribe(() => undefined)
  fake.queries[0]!.reject(new Error("unavailable"))
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceMotion: true, isResolved: true })
  unsubscribe()
})

test("a query that returns after every consumer left cannot publish stale state", async () => {
  const fake = createSource()
  const store = createReducedMotionStore(fake.source)
  const unsubscribe = store.subscribe(() => undefined)
  unsubscribe()
  fake.queries[0]!.resolve(false)
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceMotion: true, isResolved: false })

  const again = store.subscribe(() => undefined)
  assert.equal(fake.queries.length, 2)
  fake.queries[1]!.resolve(false)
  await flush()
  assert.equal(store.getSnapshot().reduceMotion, false)
  again()
})
