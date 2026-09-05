import assert from "node:assert/strict"
import test from "node:test"

import { runDiscoveryRefresh } from "./discoveryRefreshModel"

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
