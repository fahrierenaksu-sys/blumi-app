import assert from "node:assert/strict"
import test from "node:test"
import { createReconnectTransitionTracker } from "./reconnectTransitionTracker"

test("ignores the first connection and duplicate connected notifications", () => {
  const isReconnect = createReconnectTransitionTracker("connecting")

  assert.equal(isReconnect("connected"), false)
  assert.equal(isReconnect("connected"), false)
  assert.equal(isReconnect("reconnecting"), false)
  assert.equal(isReconnect("connected"), true)
  assert.equal(isReconnect("connected"), false)
})

test("a subscriber that starts connected refreshes only after a later drop", () => {
  const isReconnect = createReconnectTransitionTracker("connected")

  assert.equal(isReconnect("connected"), false)
  assert.equal(isReconnect("disconnected"), false)
  assert.equal(isReconnect("connecting"), false)
  assert.equal(isReconnect("connected"), true)
})
