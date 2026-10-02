import assert from "node:assert/strict"
import test from "node:test"
import {
  getOnboardingPopulationOdometerColumns
} from "./onboardingPopulationCounterModel"

test("population counter builds ten independent odometer wheels", () => {
  const columns = getOnboardingPopulationOdometerColumns("8.000.000.000+")

  assert.equal(columns.length, 10)
  assert.equal(columns[0]?.finalDigit, 8)
  assert.equal(columns[0]?.steps, 8)
  assert.equal(columns[9]?.finalDigit, 0)
  assert.equal(columns[9]?.steps, 50)
  assert.equal(columns[9]?.digits.at(-1), 0)
  assert.ok(columns[9]!.steps > columns[1]!.steps)
})

test("population counter exposes stable per-cell offsets instead of multiline text", () => {
  const [firstColumn] = getOnboardingPopulationOdometerColumns("8.000.000.000+")

  assert.deepEqual(firstColumn?.cells.slice(0, 3), [
    { digit: 0, offset: 0 },
    { digit: 1, offset: 1 },
    { digit: 2, offset: 2 }
  ])
  assert.deepEqual(firstColumn?.cells.at(-1), { digit: 8, offset: 8 })
})
