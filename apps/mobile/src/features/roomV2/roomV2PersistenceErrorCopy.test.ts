import assert from "node:assert/strict"
import test from "node:test"
import { getRoomV2PersistenceErrorMessageForDisplay } from "./roomV2PersistenceErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"

test("Room persistence errors preserve the available local state without technical diagnostics", () => {
  assert.equal(
    getRoomV2PersistenceErrorMessageForDisplay("load", technicalError, {
      hasLocalRoom: true
    }),
    "Your room is available offline. We couldn't sync it yet."
  )
  assert.equal(
    getRoomV2PersistenceErrorMessageForDisplay("load", technicalError, {
      hasLocalRoom: false
    }),
    "A fresh room is ready on this device. We couldn't sync your saved room yet."
  )
  assert.equal(
    getRoomV2PersistenceErrorMessageForDisplay("sync", technicalError),
    "Your room is saved on this device. We couldn't sync it yet. Try again later."
  )
  assert.equal(
    getRoomV2PersistenceErrorMessageForDisplay("sync", technicalError, {
      isSavedOnDevice: false
    }),
    "Your room is open, but the latest change could not be saved on this device or synced yet. Keep this screen open and try again."
  )
})
