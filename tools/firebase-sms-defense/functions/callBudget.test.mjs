import assert from "node:assert/strict"
import test from "node:test"
import { createCallableBudget } from "./callBudget.mjs"

test("callable source and instance budgets bound work before database access", () => {
  let now = 0
  const metrics = []
  const allow = createCallableBudget({ secret: Buffer.alloc(32, 1), now: () => now, report: counts => metrics.push(counts) })
  for (let i = 0; i < 20; i++) assert.equal(allow("fixture-source"), true)
  for (let i = 0; i < 200; i++) assert.equal(allow("fixture-source"), false)
  // One refused source cannot consume every other source's remaining budget.
  for (let i = 0; i < 100; i++) assert.equal(allow(`fixture-source-${i}`), true)
  assert.equal(allow("another-source"), false)
  now += 60_000
  assert.equal(allow("fixture-source"), true)
  assert.equal(allow(undefined), false)
  assert.deepEqual(metrics, [{ metric: "sms_gate_work_budget", allowed: 120, refused: 201 }])
})
