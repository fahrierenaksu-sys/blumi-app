import assert from "node:assert/strict"
import test from "node:test"

import { DiscoveryRefreshLimitError } from "./discoveryApi"
import { createDiscoveryRefreshController, runDiscoveryRefresh } from "./discoveryRefreshModel"

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
} {
  let resolvePromise: (() => void) | undefined
  let rejectPromise: ((error: Error) => void) | undefined
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve: () => resolvePromise?.(),
    reject: (error) => rejectPromise?.(error)
  }
}

test("discovery refresh remains pending until the real refresh boundary settles", async () => {
  const deferred = createDeferred()
  let settled = false

  const refresh = runDiscoveryRefresh(() => deferred.promise).finally(() => {
    settled = true
  })

  await Promise.resolve()
  assert.equal(settled, false)

  deferred.resolve()

  assert.deepEqual(await refresh, { status: "success" })
  assert.equal(settled, true)
})

test("discovery refresh returns a user-facing failure instead of swallowing it", async () => {
  const deferred = createDeferred()
  const refresh = runDiscoveryRefresh(() => deferred.promise)

  deferred.reject(new Error("socket unavailable"))

  assert.deepEqual(await refresh, {
    status: "error",
    message: "Couldn't refresh Discover. Check your connection and try again."
  })
})

function createPendingLog() {
  const changes: boolean[] = []
  const controller = createDiscoveryRefreshController({ onPendingChange: (pending) => changes.push(pending) })
  return { changes, controller }
}

test("refresh pending clears after a success", async () => {
  const { changes, controller } = createPendingLog()
  const deferred = createDeferred()
  const run = controller.run(() => deferred.promise)
  assert.deepEqual(changes, [true])
  deferred.resolve()
  assert.deepEqual(await run, { status: "success" })
  assert.deepEqual(changes, [true, false])
})

test("refresh pending clears after an error", async () => {
  const { changes, controller } = createPendingLog()
  const result = await controller.run(() => Promise.reject(new Error("offline")))
  assert.equal(result.status, "error")
  assert.deepEqual(changes, [true, false])
})

test("refresh pending clears when the refresh limit error is rethrown", async () => {
  const { changes, controller } = createPendingLog()
  await assert.rejects(
    controller.run(() => Promise.reject(new DiscoveryRefreshLimitError(30))),
    DiscoveryRefreshLimitError
  )
  assert.deepEqual(changes, [true, false])
  // The controller is usable again after the limit error.
  assert.deepEqual(await controller.run(() => Promise.resolve()), { status: "success" })
})

test("overlapping refresh calls run the refresh once", async () => {
  const { changes, controller } = createPendingLog()
  const deferred = createDeferred()
  let calls = 0
  const refresh = () => {
    calls += 1
    return deferred.promise
  }
  const first = controller.run(refresh)
  assert.deepEqual(await controller.run(refresh), { status: "skipped" })
  assert.equal(calls, 1)
  deferred.resolve()
  assert.deepEqual(await first, { status: "success" })
  assert.deepEqual(changes, [true, false])
})
