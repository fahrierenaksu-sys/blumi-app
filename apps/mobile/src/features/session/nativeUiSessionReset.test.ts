import test from "node:test"
import assert from "node:assert/strict"
import {
  shouldIgnoreNativeUiSessionResetError,
  shouldResetNativeUiTestSession
} from "./nativeUiSessionReset"

test("resets the native UI session only before the first launch of a test run", () => {
  assert.equal(shouldResetNativeUiTestSession(null), true)
  assert.equal(shouldResetNativeUiTestSession("false"), true)
  assert.equal(shouldResetNativeUiTestSession("true"), false)
})

test("ignores only unavailable credential storage while clearing native UI test state", () => {
  assert.equal(
    shouldIgnoreNativeUiSessionResetError({
      code: "secure_session_storage_unavailable"
    }),
    true
  )
  assert.equal(
    shouldIgnoreNativeUiSessionResetError(new Error("No keychain is available")),
    false
  )
  assert.equal(
    shouldIgnoreNativeUiSessionResetError({ code: "unexpected_storage_error" }),
    false
  )
})
