import assert from "node:assert/strict"
import test from "node:test"
import {
  connectionSetupLimitForPool,
  createConnectionSetupGate
} from "./connectionSetupGate"

test("the gate admits up to its limit and sheds the rest at once", () => {
  const gate = createConnectionSetupGate(2)
  const first = gate.tryAcquire()
  const second = gate.tryAcquire()
  assert.ok(first && second)
  assert.equal(gate.tryAcquire(), null)
  assert.equal(gate.inFlight(), 2)
  first()
  first()
  assert.equal(gate.inFlight(), 1, "a release is idempotent")
  assert.ok(gate.tryAcquire())
})

test("connection setup takes at most half the database pool", () => {
  assert.equal(connectionSetupLimitForPool(10), 5)
  assert.equal(connectionSetupLimitForPool(15), 7)
  assert.equal(connectionSetupLimitForPool(2), 2)
  assert.throws(() => createConnectionSetupGate(0))
})
