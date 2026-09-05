import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  ONBOARDING_POPULATION_COUNTER_LAYOUT,
  ONBOARDING_POPULATION_COUNTER_TIMING_MS,
  getOnboardingPopulationOdometerColumns
} from "./onboardingPopulationCounterModel"

test("population counter leaves a quiet hold after the continuous roll", () => {
  const timing = ONBOARDING_POPULATION_COUNTER_TIMING_MS

  assert.ok(timing.finalHold >= 140)
  assert.ok(timing.finalHold <= 240)
})

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

test("population digit columns leave enough horizontal room for Inter Black zeros", () => {
  assert.ok(ONBOARDING_POPULATION_COUNTER_LAYOUT.digitWidth >= 29)
  assert.ok(ONBOARDING_POPULATION_COUNTER_LAYOUT.compactDigitWidth >= 25)
})

test("population counter renders wheel cells as a flowing strip instead of absolute overlays", () => {
  const source = readFileSync(path.join(import.meta.dirname, "OnboardingPopulationCounter.tsx"), "utf8")

  assert.match(source, /styles\.populationDigitStrip/)
  assert.match(source, /styles\.populationDigitCellFrame/)
  assert.doesNotMatch(source, /\{\s*top:\s*cell\.offset\s*\*\s*lineHeight\s*\}/)
})
