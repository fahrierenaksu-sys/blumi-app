import assert from "node:assert/strict"
import test from "node:test"
import { getSessionErrorMessageForDisplay } from "./sessionErrorCopy"

const technicalError = new Error(
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
)

test("session errors redact native transport diagnostics without erasing safe action feedback", () => {
  assert.equal(
    getSessionErrorMessageForDisplay(technicalError),
    "Blumi is hard to reach right now. Your vibe is still safe."
  )
  assert.equal(
    getSessionErrorMessageForDisplay(new Error("Network request failed")),
    "Blumi is hard to reach right now. Your vibe is still safe."
  )
  assert.equal(
    getSessionErrorMessageForDisplay(new Error("That verification code has expired.")),
    "That verification code has expired."
  )
})
