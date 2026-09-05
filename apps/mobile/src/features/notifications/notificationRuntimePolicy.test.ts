import assert from "node:assert/strict"
import test from "node:test"
import { shouldInitializeNativeNotifications } from "./notificationRuntimePolicy"

test("native notifications stay enabled for production iOS and Android builds", () => {
  assert.equal(shouldInitializeNativeNotifications("ios", false), true)
  assert.equal(shouldInitializeNativeNotifications("android", false), true)
})

test("development builds skip native notification auto-registration", () => {
  assert.equal(shouldInitializeNativeNotifications("ios", true), false)
  assert.equal(shouldInitializeNativeNotifications("android", true), false)
})

test("web and unsupported platforms never initialize native notifications", () => {
  assert.equal(shouldInitializeNativeNotifications("web", false), false)
  assert.equal(shouldInitializeNativeNotifications("macos", false), false)
})
