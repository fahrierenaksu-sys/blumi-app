import assert from "node:assert/strict"
import test from "node:test"
import { createCoalescedFlush } from "./connectionDecisionFlushGate"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

test("a flush requested mid-flush runs once more afterwards instead of being dropped", async () => {
  const runs: { input: string; done: ReturnType<typeof deferred<number>> }[] = []
  const flush = createCoalescedFlush((input: string) => {
    const done = deferred<number>()
    runs.push({ input, done })
    return done.promise
  })

  const first = flush("ada", "resume")
  // Reconnect lands while the resume flush (network not ready yet) runs.
  const second = flush("ada", "connected")
  const third = flush("ada", "connected-again")
  assert.equal(runs.length, 1, "never two flushes of one outbox at once")
  assert.equal(second, third, "later requests share one trailing flush")

  runs[0]?.done.reject(new Error("network connection was lost"))
  await assert.rejects(first)
  await settle()
  assert.equal(runs.length, 2)
  assert.equal(runs[1]?.input, "connected-again", "the trailing flush uses the latest session input")
  runs[1]?.done.resolve(3)
  assert.equal(await second, 3)
  await settle()
  assert.equal(runs.length, 2, "no extra flush without a new request")
})

test("a request arriving while the trailing flush is starting joins it", async () => {
  const runs: ReturnType<typeof deferred<number>>[] = []
  const flush = createCoalescedFlush(() => {
    const done = deferred<number>()
    runs.push(done)
    return done.promise
  })
  void flush("ada", 1)
  const trailing = flush("ada", 2)
  runs[0]?.resolve(1)
  await Promise.resolve()
  const late = flush("ada", 3)
  await settle()
  assert.equal(runs.length, 2)
  assert.equal(late, trailing)
  runs[1]?.resolve(2)
  assert.equal(await late, 2)
})

test("different accounts flush independently", () => {
  const inputs: string[] = []
  const flush = createCoalescedFlush((input: string) => {
    inputs.push(input)
    return new Promise<void>(() => undefined)
  })
  void flush("ada", "a")
  void flush("grace", "g")
  assert.deepEqual(inputs, ["a", "g"])
})
