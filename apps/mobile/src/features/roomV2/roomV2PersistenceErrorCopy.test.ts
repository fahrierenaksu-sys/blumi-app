import assert from "node:assert/strict"
import test from "node:test"
import { getRoomV2PersistenceErrorMessageForDisplay } from "./roomV2PersistenceErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"

const technicalFragments = ["fetch failed", "UnexpectedException", "Promise.swift", "ExpoModulesCore"]

test("Room persistence errors preserve the available local state without technical diagnostics", () => {
  const messages = {
    loadWithLocalRoom: getRoomV2PersistenceErrorMessageForDisplay("load", technicalError, {
      hasLocalRoom: true
    }),
    loadWithoutLocalRoom: getRoomV2PersistenceErrorMessageForDisplay("load", technicalError, {
      hasLocalRoom: false
    }),
    syncSavedOnDevice: getRoomV2PersistenceErrorMessageForDisplay("sync", technicalError),
    syncNotSavedOnDevice: getRoomV2PersistenceErrorMessageForDisplay("sync", technicalError, {
      isSavedOnDevice: false
    })
  }

  for (const [state, message] of Object.entries(messages)) {
    assert.equal(typeof message, "string", state)
    assert.ok(message.trim().length > 0, `${state} shows a message`)
    for (const fragment of technicalFragments) {
      assert.equal(message.includes(fragment), false, `${state} must not show "${fragment}"`)
    }
  }
  assert.equal(
    new Set(Object.values(messages)).size,
    Object.keys(messages).length,
    "each local-state situation explains itself differently"
  )
})
