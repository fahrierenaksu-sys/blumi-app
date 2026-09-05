import assert from "node:assert/strict"
import test from "node:test"
import { startPeriodicWorker } from "./periodicWorker"

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
