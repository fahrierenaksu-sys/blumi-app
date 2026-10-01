import assert from "node:assert/strict"
import test from "node:test"
import { startSignedOutTapDiscard } from "./signedOutNotificationTaps"

function fakeNotifications() {
  let listener: ((response: unknown) => void) | undefined
  let clears = 0
  return {
    get clears() { return clears },
    get subscribed() { return listener !== undefined },
    tap: () => listener?.({ notification: {} }),
    api: {
      clearLastNotificationResponseAsync: async () => { clears++ },
      addNotificationResponseReceivedListener: (next: (response: unknown) => void) => {
        listener = next
        return { remove: () => { listener = undefined } }
      }
    }
  }
}

test("a tap stored before or during the signed-out screen is cleared and never replayed at sign-in", () => {
  const fake = fakeNotifications()
  const stop = startSignedOutTapDiscard(fake.api, () => {})
  assert.equal(fake.clears, 1, "a cold-start tap made while signed out is dropped")
  fake.tap()
  assert.equal(fake.clears, 2)
  stop()
  assert.equal(fake.subscribed, false, "signing in hands taps back to the session's router")
  fake.tap()
  assert.equal(fake.clears, 2)
})

test("a failed clear is reported only while the discard is active", async () => {
  const errors: unknown[] = []
  const stop = startSignedOutTapDiscard({
    clearLastNotificationResponseAsync: async () => { throw new Error("native") },
    addNotificationResponseReceivedListener: () => ({ remove: () => {} })
  }, (error) => { errors.push(error) })
  await new Promise(setImmediate)
  assert.equal(errors.length, 1)
  stop()
})
