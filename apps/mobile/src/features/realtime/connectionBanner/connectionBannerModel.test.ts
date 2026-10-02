import assert from "node:assert/strict"
import test from "node:test"
import type { RealtimeConnectionStatus } from "@blumi/realtime-client"
import {
  CONNECTION_BANNER_GRACE_MS,
  createConnectionBannerGate,
  resolveConnectionIssue,
  type ConnectionBannerState
} from "./connectionBannerModel"

/** Virtual clock driving the gate's single pending timer. */
function createHarness() {
  let now = 0
  let pending: { at: number; callback: () => void } | null = null
  const shown: ConnectionBannerState[] = []
  let state: ConnectionBannerState = "hidden"
  const gate = createConnectionBannerGate({
    schedule: (callback, delayMs) => {
      const entry = { at: now + delayMs, callback }
      pending = entry
      return () => { if (pending === entry) pending = null }
    },
    onChange: (next) => {
      state = next
      shown.push(next)
    }
  })
  return {
    gate,
    shown,
    state: () => state,
    update: (status: RealtimeConnectionStatus, options: { isConnected?: boolean; appActive?: boolean } = {}) => {
      gate.update({
        status,
        isConnected: options.isConnected ?? true,
        appActive: options.appActive ?? true
      })
    },
    advance: (ms: number) => {
      now += ms
      const due = pending
      if (due && due.at <= now) {
        pending = null
        due.callback()
      }
    }
  }
}

test("the raw connection issue maps realtime and device state honestly", () => {
  assert.equal(resolveConnectionIssue("connected", true), "hidden")
  assert.equal(resolveConnectionIssue("idle", true), "hidden")
  assert.equal(resolveConnectionIssue("connecting", true), "reconnecting")
  assert.equal(resolveConnectionIssue("reconnecting", true), "reconnecting")
  assert.equal(resolveConnectionIssue("disconnected", true), "reconnecting")
  assert.equal(resolveConnectionIssue("error", true), "reconnecting")
  assert.equal(resolveConnectionIssue("unreachable", true), "unreachable")
  // Device offline wins: the fix is on the user's side.
  assert.equal(resolveConnectionIssue("unreachable", false), "offline")
  assert.equal(resolveConnectionIssue("connected", false), "offline")
})

test("a reconnect that finishes inside the grace period never shows the banner", () => {
  const harness = createHarness()
  harness.update("disconnected")
  harness.update("reconnecting")
  harness.advance(CONNECTION_BANNER_GRACE_MS - 1)
  assert.equal(harness.state(), "hidden")
  harness.update("connected")
  harness.advance(60_000)
  assert.deepEqual(harness.shown, [], "no visible state was ever published")
})

test("an outage that outlasts the grace period is shown and clears at once", () => {
  const harness = createHarness()
  harness.update("reconnecting")
  harness.advance(CONNECTION_BANNER_GRACE_MS - 1)
  assert.equal(harness.state(), "hidden")
  harness.advance(1)
  assert.equal(harness.state(), "reconnecting")

  harness.update("unreachable")
  assert.equal(harness.state(), "unreachable", "a visible banner updates its message at once")
  harness.update("connected")
  assert.equal(harness.state(), "hidden")
})

test("changing the kind of problem does not restart the grace period", () => {
  const harness = createHarness()
  harness.update("disconnected")
  harness.advance(2_000)
  harness.update("error")
  harness.update("reconnecting")
  harness.advance(CONNECTION_BANNER_GRACE_MS - 2_000)
  assert.equal(harness.state(), "reconnecting")
})

test("nothing shows while backgrounded and resume starts a fresh grace period", () => {
  const harness = createHarness()
  harness.update("connected")
  harness.update("disconnected", { appActive: false })
  harness.advance(10 * 60_000)
  assert.equal(harness.state(), "hidden", "a background outage is never shown")

  harness.update("reconnecting", { appActive: true })
  assert.equal(harness.state(), "hidden", "never in the first moments after resume")
  harness.advance(CONNECTION_BANNER_GRACE_MS - 1)
  assert.equal(harness.state(), "hidden")
  harness.update("connected")
  harness.advance(60_000)
  assert.deepEqual(harness.shown, [])
})

test("a visible banner hides when the app leaves the foreground and waits again on return", () => {
  const harness = createHarness()
  harness.update("reconnecting")
  harness.advance(CONNECTION_BANNER_GRACE_MS)
  assert.equal(harness.state(), "reconnecting")

  harness.update("reconnecting", { appActive: false })
  assert.equal(harness.state(), "hidden", "the app switcher snapshot stays clean")
  harness.update("reconnecting", { appActive: true })
  assert.equal(harness.state(), "hidden")
  harness.advance(CONNECTION_BANNER_GRACE_MS)
  assert.equal(harness.state(), "reconnecting")
})

test("a real offline state is still shown after the grace period", () => {
  const harness = createHarness()
  harness.update("reconnecting", { isConnected: false })
  assert.equal(harness.state(), "hidden")
  harness.advance(CONNECTION_BANNER_GRACE_MS)
  assert.equal(harness.state(), "offline")
  harness.update("reconnecting", { isConnected: true })
  assert.equal(harness.state(), "reconnecting", "the outage continues, only its cause changed")
})

test("dispose cancels a pending reveal", () => {
  const harness = createHarness()
  harness.update("reconnecting")
  harness.gate.dispose()
  harness.advance(60_000)
  assert.deepEqual(harness.shown, [])
})
