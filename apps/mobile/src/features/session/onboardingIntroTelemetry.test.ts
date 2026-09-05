import assert from "node:assert/strict"
import test from "node:test"

import {
  createOnboardingIntroTelemetry,
  getOnboardingIntroBeatEvent,
  getOnboardingIntroPerformanceEvent,
  recordOnboardingFrameSample
} from "./onboardingIntroTelemetry"

test("intro beat events are idempotent per beat and stay analytics-safe", () => {
  const telemetry = createOnboardingIntroTelemetry(1_000, 1_180)

  assert.deepEqual(
    getOnboardingIntroBeatEvent(telemetry, {
      beat: "scan",
      nowMs: 1_050,
      reduceMotion: false,
      resumed: false
    }),
    {
      name: "onboarding_step_viewed",
      properties: {
        step: "intro_scan",
        flow: "auth_entry_intro",
        resumed: false,
        reduce_motion: false,
        elapsed_ms: 50
      }
    }
  )

  assert.equal(
    getOnboardingIntroBeatEvent(telemetry, {
      beat: "scan",
      nowMs: 1_060,
      reduceMotion: false,
      resumed: false
    }),
    null
  )
})

test("frame samples produce a bounded performance payload for intro completion", () => {
  const telemetry = createOnboardingIntroTelemetry(1_000, 1_180)

  recordOnboardingFrameSample(telemetry, 1_016)
  recordOnboardingFrameSample(telemetry, 1_033)
  recordOnboardingFrameSample(telemetry, 1_086)

  assert.deepEqual(
    getOnboardingIntroPerformanceEvent(telemetry, {
      nowMs: 1_900,
      reduceMotion: false,
      resumed: true,
      coldStartMs: 900
    }),
    {
      name: "onboarding_intro_performance",
      properties: {
        step: "intro",
        flow: "auth_entry_intro",
        resumed: true,
        reduce_motion: false,
        elapsed_ms: 900,
        cold_start_ms: 900,
        js_mount_ms: 180,
        intro_visible_ms: 720,
        intro_frame_samples: 2,
        intro_slow_frames: 1,
        intro_severe_frames: 1,
        intro_worst_frame_ms: 53,
        intro_average_frame_ms: 35
      }
    }
  )
})
