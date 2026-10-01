import assert from "node:assert/strict"
import test from "node:test"
import {
  getClampedClockProgress,
  getLoopingClockProgress,
  getRewindClockProgress
} from "./onboardingWorldClockModel"

test("a stopped one-shot clock resumes where wall time left it and never passes the end", () => {
  const run = { startProgress: 0.25, startedAtMs: 1_000, durationMs: 1_000 }
  assert.equal(getClampedClockProgress(run, 1_000), 0.25)
  assert.equal(getClampedClockProgress(run, 1_500), 0.75)
  assert.equal(getClampedClockProgress(run, 9_000), 1)
  assert.equal(getClampedClockProgress(run, 500), 0.25, "a clock never runs backwards")
  assert.equal(getClampedClockProgress({ ...run, durationMs: 0 }, 1_500), 1)
})

test("the endless globe turn wraps instead of saturating", () => {
  const run = { startProgress: 0.9, startedAtMs: 0, durationMs: 10_000 }
  assert.ok(Math.abs(getLoopingClockProgress(run, 2_000) - 0.1) < 1e-9)
  assert.ok(Math.abs(getLoopingClockProgress(run, 12_000) - 0.1) < 1e-9)
  assert.equal(getLoopingClockProgress({ ...run, durationMs: 0 }, 5), 0)
})

test("a rollback winds the handoff back to zero at its own pace", () => {
  const run = { startProgress: 0.5, startedAtMs: 0, durationMs: 160 }
  assert.equal(getRewindClockProgress(run, 40), 0.25)
  assert.equal(getRewindClockProgress(run, 400), 0)
  assert.equal(getRewindClockProgress({ ...run, durationMs: 0 }, 1), 0)
})
