import assert from "node:assert/strict"
import test from "node:test"
import {
  OTA_FOREGROUND_CHECK_INTERVAL_MS,
  formatRunningUpdateLabel,
  resolveOtaUpdateMode,
  shouldCheckForOtaUpdate
} from "./otaUpdatePolicy"

test("only the preview channel applies updates on foreground", () => {
  assert.equal(resolveOtaUpdateMode({ isEnabled: true, channel: "preview", isDevelopmentRuntime: false }), "apply-on-foreground")
  assert.equal(resolveOtaUpdateMode({ isEnabled: true, channel: "production", isDevelopmentRuntime: false }), "next-launch")
})

test("updates stay off in Metro, disabled or unknown-channel runtimes", () => {
  assert.equal(resolveOtaUpdateMode({ isEnabled: true, channel: "preview", isDevelopmentRuntime: true }), "off")
  assert.equal(resolveOtaUpdateMode({ isEnabled: false, channel: "preview", isDevelopmentRuntime: false }), "off")
  assert.equal(resolveOtaUpdateMode({ isEnabled: true, channel: null, isDevelopmentRuntime: false }), "off")
  assert.equal(resolveOtaUpdateMode({ isEnabled: true, channel: "staging", isDevelopmentRuntime: false }), "off")
})

test("foreground checks are throttled and never overlap", () => {
  assert.equal(shouldCheckForOtaUpdate({ inFlight: false, lastCheckedAt: null, now: 0 }), true)
  assert.equal(shouldCheckForOtaUpdate({ inFlight: true, lastCheckedAt: null, now: 0 }), false)
  assert.equal(shouldCheckForOtaUpdate({ inFlight: false, lastCheckedAt: 1_000, now: 1_000 + OTA_FOREGROUND_CHECK_INTERVAL_MS - 1 }), false)
  assert.equal(shouldCheckForOtaUpdate({ inFlight: false, lastCheckedAt: 1_000, now: 1_000 + OTA_FOREGROUND_CHECK_INTERVAL_MS }), true)
})

test("the running update label names the channel and the update time", () => {
  const createdAt = new Date(2026, 8, 30, 15, 52)
  assert.equal(formatRunningUpdateLabel({ isEnabled: true, channel: "preview", isEmbeddedLaunch: false, createdAt, locale: "tr" }), "preview · güncelleme 30.09 15:52")
  assert.equal(formatRunningUpdateLabel({ isEnabled: true, channel: "production", isEmbeddedLaunch: false, createdAt, locale: "en" }), "production · update 30.09 15:52")
  assert.equal(formatRunningUpdateLabel({ isEnabled: true, channel: "preview", isEmbeddedLaunch: true, createdAt, locale: "tr" }), "preview · yerleşik")
  assert.equal(formatRunningUpdateLabel({ isEnabled: false, channel: "preview", isEmbeddedLaunch: false, createdAt, locale: "tr" }), null)
  assert.equal(formatRunningUpdateLabel({ isEnabled: true, channel: null, isEmbeddedLaunch: false, createdAt, locale: "tr" }), null)
})
