import assert from "node:assert/strict"
import test from "node:test"
import { startChatDeliveryWorker } from "./chatDeliveryWorker"
import type { ChatMessageDeliveryService } from "./chatMessageDeliveryService"

test("chat delivery worker stop drains the in-flight cycle", async () => {
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const pending = new Promise<void>((resolve) => { release = resolve })
  const worker = startChatDeliveryWorker({ deliveryService: {
    async dispatchDue() { entered(); await pending }
  } as ChatMessageDeliveryService })
  await started
  let stopped = false
  const stop = worker.stop().then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)
  release()
  await stop
  assert.equal(stopped, true)
})
