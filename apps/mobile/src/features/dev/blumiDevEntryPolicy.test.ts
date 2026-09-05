import assert from "node:assert/strict"
import test from "node:test"
import {
  canApplyBlumiDevEntry,
  shouldApplyBlumiDevEntryNavigation
} from "./blumiDevEntryPolicy"

test("dev entry requires an explicit route in a development Debug runtime", () => {
  for (const route of [
    "myroom",
    "mini-room-rig-preview",
    "home-studio-pilot"
  ] as const) {
    assert.equal(canApplyBlumiDevEntry({
      route,
      buildProfile: "development",
      isDevelopmentRuntime: true
    }), true)
  }
})

test("dev entry fails closed outside the development Debug runtime", () => {
  for (const input of [
    { route: undefined, buildProfile: "development", isDevelopmentRuntime: true },
    { route: "mini-room-rig-preview", buildProfile: "preview", isDevelopmentRuntime: true },
    { route: "mini-room-rig-preview", buildProfile: "production", isDevelopmentRuntime: true },
    { route: "mini-room-rig-preview", buildProfile: "development", isDevelopmentRuntime: false }
  ] as const) {
    assert.equal(canApplyBlumiDevEntry(input), false)
  }
})

test("the isolated native-ui-test profile may open only an explicit dev entry route", () => {
  assert.equal(canApplyBlumiDevEntry({
    route: "home-studio-pilot",
    buildProfile: "native-ui-test",
    isDevelopmentRuntime: false
  }), true)
  assert.equal(canApplyBlumiDevEntry({
    route: "home-studio-pilot",
    buildProfile: "release",
    isDevelopmentRuntime: false
  }), false)
})

test("dev entry navigation is reapplied when the session navigator remounts", () => {
  const shared = {
    route: "home-studio-pilot" as const,
    buildProfile: "native-ui-test",
    isDevelopmentRuntime: false,
    sessionEntryRoute: "Main" as const,
    hasSessionActor: true,
    navigationReady: true
  }

  assert.equal(shouldApplyBlumiDevEntryNavigation({
    ...shared,
    appliedNavigationGeneration: 0,
    navigationGeneration: 1
  }), true)
  assert.equal(shouldApplyBlumiDevEntryNavigation({
    ...shared,
    appliedNavigationGeneration: 1,
    navigationGeneration: 1
  }), false)
  assert.equal(shouldApplyBlumiDevEntryNavigation({
    ...shared,
    appliedNavigationGeneration: 1,
    navigationGeneration: 2
  }), true)
})
