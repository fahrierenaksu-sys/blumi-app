import assert from "node:assert/strict"
import test from "node:test"

import { isExplicitRoomV3QaRuntime } from "./roomV3QaRuntimeGate"

test("room QA runtime accepts interactive development and the isolated native UI test profile", () => {
  assert.equal(isExplicitRoomV3QaRuntime({
    isDevelopmentRuntime: true,
    buildProfile: "development"
  }), true)
  assert.equal(isExplicitRoomV3QaRuntime({
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test"
  }), true)
})

test("room QA runtime stays disabled for production and non-development builds", () => {
  for (const input of [
    { isDevelopmentRuntime: false, buildProfile: "development" },
    { isDevelopmentRuntime: true, buildProfile: "production" },
    { isDevelopmentRuntime: false, buildProfile: "production" }
  ]) {
    assert.equal(isExplicitRoomV3QaRuntime(input), false)
  }
})
