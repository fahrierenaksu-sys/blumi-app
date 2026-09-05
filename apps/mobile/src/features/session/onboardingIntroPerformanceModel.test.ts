import assert from "node:assert/strict"
import test from "node:test"

import {
  createOnboardingIntroPerformanceSession,
  getOnboardingIntroFrameHealth,
  summarizeOnboardingIntroPerformance
} from "./onboardingIntroPerformanceModel"

test("frame health keeps compact intro metrics without per-frame payload bloat", () => {
  assert.deepEqual(
    getOnboardingIntroFrameHealth([16, 17, 18, 35, 22, 49]),
    {
      frame_samples: 6,
      slow_frames: 3,
      severe_frames: 1,
      worst_frame_ms: 49,
      average_frame_ms: 26
    }
  )
})

test("performance summary derives cold-start and interaction timings from the native boot epoch", () => {
  const session = createOnboardingIntroPerformanceSession({
    bootStartedAtMs: 1_000,
    mountedAtMs: 1_180,
    reduceMotion: false
  })

  assert.deepEqual(
    summarizeOnboardingIntroPerformance({
      session,
      interactionReadyAtMs: 3_860,
      frameDurationsMs: [16, 16, 17, 24, 28, 18]
    }),
    {
      reduce_motion: false,
      cold_start_ms: 2_860,
      js_mount_ms: 180,
      intro_visible_ms: 2_680,
      frame_samples: 6,
      slow_frames: 2,
      severe_frames: 0,
      worst_frame_ms: 28,
      average_frame_ms: 20
    }
  )
})
