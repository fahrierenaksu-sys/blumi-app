import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveBlumiNativeUiTestSessionResetEnabled,
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
