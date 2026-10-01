import assert from "node:assert/strict"
import test from "node:test"
import {
  createReduceTransparencyStore,
  type ReduceTransparencySource
} from "./reduceTransparencyStore"

function createSource(initial: Promise<boolean>) {
  const osListeners = new Set<(enabled: boolean) => void>()
  let removals = 0
  let queries = 0
  const source: ReduceTransparencySource = {
    isReduceTransparencyEnabled: () => { queries += 1; return initial },
    addEventListener: (_event, listener) => {
      osListeners.add(listener)
      return { remove: () => { removals += 1; osListeners.delete(listener) } }
    }
  }
  return {
    source,
    emit: (enabled: boolean) => { for (const listener of osListeners) listener(enabled) },
    get removals() { return removals },
    get queries() { return queries }
  }
}

function createDeferredSource() {
  const pending: { resolve: (value: boolean) => void }[] = []
  const source: ReduceTransparencySource = {
    isReduceTransparencyEnabled: () =>
      new Promise<boolean>((resolve) => { pending.push({ resolve }) }),
    addEventListener: () => ({ remove: () => undefined })
  }
  return { source, pending }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test("starts fail closed and unresolved", () => {
  const store = createReduceTransparencyStore(createSource(Promise.resolve(false)).source)
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: true, isResolved: false })
})

test("stays opaque until the OS preference resolves", async () => {
  const fake = createSource(Promise.resolve(false))
  const store = createReduceTransparencyStore(fake.source)
  assert.equal(store.getSnapshot().reduceTransparency, true)
  let notified = 0
  const unsubscribe = store.subscribe(() => { notified += 1 })
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: false, isResolved: true })
  assert.equal(notified, 1)
  unsubscribe()
})

test("consumers share one OS query and one listener, released with the last", async () => {
  const fake = createSource(Promise.resolve(false))
  const store = createReduceTransparencyStore(fake.source)
  const unsubscribers = Array.from({ length: 5 }, () => store.subscribe(() => {}))
  await flush()
  assert.equal(fake.queries, 1)
  fake.emit(true)
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: true, isResolved: true })
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  assert.equal(fake.removals, 1)
})

test("an unreadable preference keeps surfaces opaque and counts as resolved", async () => {
  const store = createReduceTransparencyStore(createSource(Promise.reject(new Error("no"))).source)
  const unsubscribe = store.subscribe(() => {})
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: true, isResolved: true })
  unsubscribe()
})

test("an OS change wins over a late initial query, including query failure", async () => {
  for (const outcome of ["resolve", "reject"] as const) {
    let resolve!: (enabled: boolean) => void
    let reject!: (error: Error) => void
    const fake = createSource(new Promise<boolean>((yes, no) => { resolve = yes; reject = no }))
    const store = createReduceTransparencyStore(fake.source)
    const unsubscribe = store.subscribe(() => undefined)
    fake.emit(false)
    if (outcome === "resolve") resolve(true)
    else reject(new Error("unavailable"))
    await flush()
    assert.deepEqual(store.getSnapshot(), { reduceTransparency: false, isResolved: true })
    fake.emit(true)
    assert.equal(store.getSnapshot().reduceTransparency, true)
    unsubscribe()
  }
})

test("the snapshot keeps its identity until the preference changes", async () => {
  const fake = createSource(Promise.resolve(false))
  const store = createReduceTransparencyStore(fake.source)
  const unresolved = store.getSnapshot()
  assert.equal(store.getSnapshot(), unresolved)
  let notified = 0
  const unsubscribe = store.subscribe(() => { notified += 1 })
  await flush()
  const resolved = store.getSnapshot()
  assert.notEqual(resolved, unresolved)
  fake.emit(false)
  assert.equal(store.getSnapshot(), resolved)
  assert.equal(notified, 1)
  assert.ok(Object.isFrozen(resolved))
  unsubscribe()
})

test("a later mount reads the resolved preference synchronously", async () => {
  const fake = createSource(Promise.resolve(false))
  const store = createReduceTransparencyStore(fake.source)
  const first = store.subscribe(() => undefined)
  await flush()
  first()

  const second = store.subscribe(() => undefined)
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: false, isResolved: true })
  second()
})

test("a query that returns after every consumer left cannot publish stale state", async () => {
  const fake = createDeferredSource()
  const store = createReduceTransparencyStore(fake.source)
  const unsubscribe = store.subscribe(() => undefined)
  unsubscribe()
  fake.pending[0]!.resolve(false)
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: true, isResolved: false })

  const again = store.subscribe(() => undefined)
  assert.equal(fake.pending.length, 2)
  fake.pending[1]!.resolve(false)
  await flush()
  assert.deepEqual(store.getSnapshot(), { reduceTransparency: false, isResolved: true })
  again()
})
