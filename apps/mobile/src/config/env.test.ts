import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveBlumiChatEmotesEnabled,
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

test("chat emotes stay off unless the flag is exactly 1", () => {
  assert.equal(resolveBlumiChatEmotesEnabled(undefined), false)
  assert.equal(resolveBlumiChatEmotesEnabled(""), false)
  assert.equal(resolveBlumiChatEmotesEnabled("0"), false)
  assert.equal(resolveBlumiChatEmotesEnabled("true"), false)
  assert.equal(resolveBlumiChatEmotesEnabled(" 1 "), true)
})
