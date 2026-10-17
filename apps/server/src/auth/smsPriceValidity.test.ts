import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "../server"
import {
  classifySmsPriceValidity,
  createSmsPriceValidityMonitor,
  type SmsPriceValiditySnapshot
} from "./smsPriceValidity"

const DAY = 86_400_000
const now = new Date("2026-11-09T00:00:00.000Z")
const at = (offsetMs: number): SmsPriceValiditySnapshot => ({ earliestValidUntil: new Date(now.getTime() + offsetMs), now })

test("the earliest enabled SMS price warns under 7 days and reports expiry or no market", () => {
  assert.deepEqual(classifySmsPriceValidity(at(30 * DAY)), { state: "ok", daysLeft: 30 })
  assert.deepEqual(classifySmsPriceValidity(at(7 * DAY)), { state: "ok", daysLeft: 7 })
  assert.deepEqual(classifySmsPriceValidity(at(7 * DAY - 1)), { state: "expiring", daysLeft: 6 })
  assert.deepEqual(classifySmsPriceValidity(at(60_000)), { state: "expiring", daysLeft: 0 })
  assert.deepEqual(classifySmsPriceValidity(at(0)), { state: "expired", daysLeft: 0 })
  assert.deepEqual(classifySmsPriceValidity(at(-3 * DAY)), { state: "expired", daysLeft: 0 })
  assert.deepEqual(classifySmsPriceValidity({ earliestValidUntil: null, now }), { state: "no_enabled_country", daysLeft: null })
})

test("the monitor logs a fixed-shape line only while sign-in is at risk", async () => {
  const lines: Array<{ level: string; line: string }> = []
  let snapshot = at(30 * DAY)
  const monitor = createSmsPriceValidityMonitor({ read: async () => snapshot, log: (level, line) => lines.push({ level, line }) })
  assert.equal(monitor.current().state, "unchecked")
  assert.equal((await monitor.check()).state, "ok")
  assert.equal(lines.length, 0)

  snapshot = at(3 * DAY)
  await monitor.check()
  snapshot = at(-DAY)
  await monitor.check()
  snapshot = { earliestValidUntil: null, now }
  await monitor.check()
  assert.deepEqual(lines.map(entry => entry.level), ["warn", "error", "error"])
  assert.deepEqual(lines.map(entry => JSON.parse(entry.line)), [
    { event: "blumi_sms_price_validity", state: "expiring", daysLeft: 3 },
    { event: "blumi_sms_price_validity", state: "expired", daysLeft: 0 },
    { event: "blumi_sms_price_validity", state: "no_enabled_country", daysLeft: null }
  ])
  assert.equal(monitor.current().state, "no_enabled_country")
})

test("an unreadable policy reports unavailable with only the error class, never its message", async () => {
  const lines: string[] = []
  const monitor = createSmsPriceValidityMonitor({
    read: async () => { throw new Error("connect failed for +12025550101 at db.internal") },
    log: (_level, line) => lines.push(line)
  })
  assert.deepEqual(await monitor.check(), { state: "unavailable", daysLeft: null })
  assert.deepEqual(lines.map(line => JSON.parse(line)), [
    { event: "blumi_sms_price_validity", state: "unavailable", daysLeft: null, errorKind: "Error" }
  ])
  assert.doesNotMatch(lines.join(""), /\+1202|db\.internal/)
})

test("/health shows the SMS price validity without failing readiness", async () => {
  let snapshot = at(2 * DAY)
  const monitor = createSmsPriceValidityMonitor({ read: async () => snapshot, log: () => {} })
  await monitor.check()
  const monitored = createServer({ logger: false, smsPriceValidity: monitor.current })
  const unmonitored = createServer({ logger: false })
  try {
    assert.deepEqual((await monitored.inject("/health")).json().smsPriceValidity, { state: "expiring", daysLeft: 2 })
    snapshot = at(-1)
    await monitor.check()
    const health = await monitored.inject("/health")
    assert.equal(health.statusCode, 200)
    assert.deepEqual(health.json().smsPriceValidity, { state: "expired", daysLeft: 0 })
    assert.equal((await monitored.inject("/ready")).statusCode, 200)
    assert.deepEqual((await unmonitored.inject("/health")).json().smsPriceValidity, { state: "not_monitored", daysLeft: null })
  } finally {
    await monitored.close()
    await unmonitored.close()
  }
})
