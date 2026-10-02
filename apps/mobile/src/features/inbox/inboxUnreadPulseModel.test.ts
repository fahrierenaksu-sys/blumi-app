import assert from "node:assert/strict"
import test from "node:test"
import { INBOX_UNREAD_PULSE_ITERATIONS, getInboxUnreadPulse } from "./inboxUnreadPulseModel"

test("the unread glow pulses a bounded number of times, never forever", () => {
  const pulse = getInboxUnreadPulse(false)

  assert.equal(pulse.iterations, INBOX_UNREAD_PULSE_ITERATIONS)
  assert.ok(Number.isInteger(pulse.iterations) && pulse.iterations > 0)
  assert.ok(pulse.maxScale > 1)
})

test("Reduce Motion keeps the unread glow still", () => {
  assert.deepEqual(getInboxUnreadPulse(true), { iterations: 0, maxScale: 1 })
})
