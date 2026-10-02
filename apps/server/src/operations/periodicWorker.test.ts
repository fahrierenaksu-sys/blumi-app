import assert from "node:assert/strict"
import test from "node:test"
import { startPeriodicWorker, startupJitterMs } from "./periodicWorker"

test("stopping periodic worker drains the admitted cycle without starting another", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let runs = 0
  const worker = startPeriodicWorker({ run: async () => { runs += 1; await gate }, intervalMs: 5 })
  await Promise.resolve()
  let stopped = false
  const stopping = worker.stop().then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)
  release()
  await stopping
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(runs, 1)
})

test("periodic worker reports failed cycles and remains drainable", async () => {
  const failures: unknown[] = []
  const worker = startPeriodicWorker({ run: async () => { throw new Error("job failed") }, intervalMs: 1000,
    reportError: (error) => failures.push(error) })
  await worker.stop()
  assert.equal(failures.length, 1)
})

test("a delayed first cycle waits for its delay, and stopping before it runs nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] })
  let runs = 0
  const worker = startPeriodicWorker({ run: async () => { runs += 1 }, intervalMs: 60_000, firstRunDelayMs: 5_000 })
  await Promise.resolve()
  assert.equal(runs, 0)
  t.mock.timers.tick(5_000)
  await Promise.resolve()
  assert.equal(runs, 1)
  await worker.stop()

  const stoppedEarly = startPeriodicWorker({ run: async () => { runs += 1 }, intervalMs: 60_000, firstRunDelayMs: 5_000 })
  await stoppedEarly.stop()
  t.mock.timers.tick(120_000)
  await Promise.resolve()
  assert.equal(runs, 1)
})

test("startup jitter stays below the interval and 30 seconds", () => {
  assert.equal(startupJitterMs(60_000, () => 0), 0)
  assert.ok(startupJitterMs(60_000, () => 0.999) < 30_000)
  assert.ok(startupJitterMs(10_000, () => 0.999) < 10_000)
})
