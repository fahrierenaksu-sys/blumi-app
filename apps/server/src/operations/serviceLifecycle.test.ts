import assert from "node:assert/strict"
import test from "node:test"
import { createGracefulShutdown, createReadinessProbe } from "./serviceLifecycle"

test("outgoing transport drain follows producers and precedes database close", async () => {
  const steps: string[] = []
  const stop = createGracefulShutdown({ markNotReady() {},
    drain: [async () => { steps.push("producer") }],
    drainOutgoing: async () => { steps.push("outgoing") }, closeData: async () => { steps.push("database") } })
  await stop()
  assert.deepEqual(steps, ["producer", "outgoing", "database"])
})

test("shutdown closes admission first, drains all work, then closes database once", async () => {
  const steps: string[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const stop = createGracefulShutdown({
    markNotReady: () => { steps.push("not-ready") },
    drain: [async () => { steps.push("drain"); await gate; steps.push("drained") }],
    closeData: async () => { steps.push("db-close") }
  })
  const first = stop()
  const second = stop()
  await Promise.resolve()
  assert.deepEqual(steps, ["not-ready", "drain"])
  release()
  await Promise.all([first, second])
  assert.deepEqual(steps, ["not-ready", "drain", "drained", "db-close"])
})

test("shutdown timeout fails without closing database beneath active work", async () => {
  let databaseClosed = false
  const stop = createGracefulShutdown({ markNotReady() {}, drain: [() => new Promise(() => {})],
    closeData: async () => { databaseClosed = true }, timeoutMs: 10 })
  await assert.rejects(stop(), /timed out/)
  assert.equal(databaseClosed, false)
})

test("shutdown reports failed drains after other drains and database complete", async () => {
  const steps: string[] = []
  const stop = createGracefulShutdown({ markNotReady() {}, drain: [async () => { throw new Error("worker failed") },
    async () => { steps.push("other drained") }], closeData: async () => { steps.push("db-close") } })
  await assert.rejects(stop(), /shutdown failed/i)
  assert.deepEqual(steps, ["other drained", "db-close"])
})

test("readiness times out, coalesces stalled queries, and refuses shutdown", async () => {
  let calls = 0
  let ready = true
  const probe = createReadinessProbe({ isAccepting: () => ready,
    check: async () => { calls += 1; await new Promise(() => {}) }, timeoutMs: 10 })
  assert.equal(await probe(), false)
  assert.equal(await probe(), false)
  assert.equal(calls, 1)
  ready = false
  assert.equal(await probe(), false)
})
