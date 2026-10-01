import assert from "node:assert/strict"
import test from "node:test"
import type { ChatAckDeliveredCommand } from "@blumi/contracts"
import { createDeliveryAckQueue } from "./deliveryAckQueue"

function harness(options: { processingLimit?: number; maxThreads?: number } = {}) {
  let now = 0
  const processed: Array<{ connectionId: string; ack: ChatAckDeliveredCommand }> = []
  const timers: Array<{ callback: () => void; at: number; cancelled: boolean }> = []
  const gates: Array<() => void> = []
  let holdRuns = false
  const queue = createDeliveryAckQueue({
    async run(connectionId, ack) {
      processed.push({ connectionId, ack })
      if (holdRuns) await new Promise<void>((resolve) => gates.push(resolve))
    },
    processingLimit: options.processingLimit ?? 30,
    windowMs: 10_000,
    maxThreadsPerConnection: options.maxThreads ?? 256,
    now: () => now,
    schedule: (callback, delayMs) => {
      const timer = { callback, at: now + delayMs, cancelled: false }
      timers.push(timer)
      return timer
    },
    cancel: (handle) => { (handle as { cancelled: boolean }).cancelled = true }
  })
  return {
    queue,
    processed,
    hold(value: boolean) { holdRuns = value },
    releaseOne() { gates.shift()?.() },
    async advance(ms: number) {
      now += ms
      for (const timer of timers.filter((entry) => !entry.cancelled && entry.at <= now)) {
        timer.cancelled = true
        timer.callback()
      }
      await settle()
    }
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
const ack = (threadId: string, upToMessageId: string) => ({ threadId, upToMessageId })

test("a burst of acks for many threads is processed one at a time and none is dropped", async () => {
  const { queue, processed } = harness()
  for (let index = 1; index <= 12; index++) {
    assert.notEqual(queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack(`t${index}`, `m${index}`) }), "full")
  }
  await settle()
  assert.deepEqual(processed.map((entry) => entry.ack.threadId), Array.from({ length: 12 }, (_, i) => `t${i + 1}`))
})

test("a newer ack for a waiting thread replaces the older one (latest wins per thread)", async () => {
  const { queue, processed, hold, releaseOne } = harness()
  hold(true)
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("busy", "m1") })
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t1", "m1") })
  assert.equal(queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t1", "m2") }), "coalesced")
  assert.equal(queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t1", "m3") }), "coalesced")
  hold(false)
  releaseOne()
  await settle()
  assert.deepEqual(processed.map((entry) => entry.ack), [ack("busy", "m1"), ack("t1", "m3")])
})

test("over the processing budget the last ack per thread waits for the next window instead of being dropped", async () => {
  const { queue, processed, advance } = harness({ processingLimit: 3 })
  for (let index = 1; index <= 5; index++) queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack(`t${index}`, "m1") })
  // A newer ack for a thread that is still waiting replaces its entry.
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t5", "m9") })
  await settle()
  assert.equal(processed.length, 3)
  await advance(9_999)
  assert.equal(processed.length, 3)
  await advance(1)
  assert.deepEqual(processed.slice(3).map((entry) => entry.ack), [ack("t4", "m1"), ack("t5", "m9")])
})

test("the processing budget is shared by a user's sockets", async () => {
  const { queue, processed } = harness({ processingLimit: 2 })
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t1", "m1") })
  queue.enqueue({ connectionId: "c2", userId: "u1", ack: ack("t2", "m1") })
  queue.enqueue({ connectionId: "c3", userId: "u1", ack: ack("t3", "m1") })
  queue.enqueue({ connectionId: "c4", userId: "u2", ack: ack("t4", "m1") })
  await settle()
  assert.deepEqual(processed.map((entry) => entry.ack.threadId).sort(), ["t1", "t2", "t4"])
})

test("waiting threads per socket are bounded and a closed socket forgets its queue", async () => {
  const { queue, processed, hold, releaseOne } = harness({ maxThreads: 2 })
  hold(true)
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("busy", "m1") })
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t1", "m1") })
  queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t2", "m1") })
  assert.equal(queue.enqueue({ connectionId: "c1", userId: "u1", ack: ack("t3", "m1") }), "full")
  queue.forgetConnection("c1")
  hold(false)
  releaseOne()
  await settle()
  assert.deepEqual(processed.map((entry) => entry.ack.threadId), ["busy"])
})
