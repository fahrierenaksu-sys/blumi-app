import assert from "node:assert/strict"
import test from "node:test"
import { startNotificationOutboxWorker } from "./notificationOutboxWorker"
import type { NotificationService } from "./notificationService"

test("stop waits for in-flight notification dispatch and prevents new cycles", async () => {
  let release!: () => void
  let calls = 0
  const pending = new Promise<void>((resolve) => { release = resolve })
  const worker = startNotificationOutboxWorker({ notificationService: {
    async dispatchDue() { calls++; await pending }
  } as NotificationService })
  let stopped = false
  const stopping = Promise.resolve(worker.stop()).then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)
  release()
  await stopping
  assert.equal(stopped, true)
  assert.equal(calls, 1)
})

test("a newly queued push is dispatched at once instead of waiting for the next poll", async () => {
  let wake: (() => void) | undefined
  let unsubscribed = false
  let calls = 0
  let releaseFirst!: () => void
  const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve })
  const worker = startNotificationOutboxWorker({
    intervalMs: 60_000,
    notificationService: {
      async dispatchDue() {
        calls += 1
        if (calls === 1) await firstRun
      },
      onDeliveriesQueued(listener: () => void) {
        wake = listener
        return () => { unsubscribed = true }
      }
    } as unknown as NotificationService
  })
  assert.equal(calls, 1, "the start-up cycle runs immediately")
  // Queued while the start-up cycle may already have claimed its batch: one
  // follow-up cycle is owed, and extra wake-ups coalesce into it.
  wake?.()
  wake?.()
  assert.equal(calls, 1)
  releaseFirst()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  wake?.()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 3)
  await worker.stop()
  assert.equal(unsubscribed, true)
  wake?.()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 3, "a stopped worker ignores wake-ups")
})
