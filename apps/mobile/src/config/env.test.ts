import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveBlumiNativeUiTestSessionResetEnabled,
  resolveBlumiRoomVNextRuntimeProofEnabled,
} from "./env"

test("allows native UI session reset only for an explicit native UI test build", () => {
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "native-ui-test",
      rawResetFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "development",
      rawResetFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiNativeUiTestSessionResetEnabled({
      buildProfile: "development",
      rawResetFlag: undefined
    }),
    false
  )
})

test("allows Room VNext proof in the isolated native UI test build only", () => {
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawProofFlag: "1"
    }),
    true
  )
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "production",
      rawProofFlag: "1"
    }),
    false
  )
  assert.equal(
    resolveBlumiRoomVNextRuntimeProofEnabled({
      isDevelopmentRuntime: false,
      buildProfile: "native-ui-test",
      rawProofFlag: undefined
    }),
    false
  )
})
