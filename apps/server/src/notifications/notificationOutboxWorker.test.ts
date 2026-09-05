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
