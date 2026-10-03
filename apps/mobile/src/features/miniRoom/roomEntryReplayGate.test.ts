import assert from "node:assert/strict"
import test from "node:test"
import {
  advanceRoomEntryReplayGate,
  createRoomEntryReplayGate
} from "./roomEntryReplayGate"

test("stale ready cache cannot satisfy a fresh room-entry replay request", () => {
  const requested = advanceRoomEntryReplayGate(createRoomEntryReplayGate(), "requested")
  const staleReady = advanceRoomEntryReplayGate(requested, "ready")

  assert.equal(staleReady.canReplay, false)

  const loading = advanceRoomEntryReplayGate(staleReady, "loading")
  const freshReady = advanceRoomEntryReplayGate(loading, "ready")
  assert.equal(freshReady.canReplay, true)
})

test("each room reopen gets one fresh replay and cannot replay twice", () => {
  const firstRequest = advanceRoomEntryReplayGate(createRoomEntryReplayGate(), "requested")
  const firstReady = advanceRoomEntryReplayGate(
    advanceRoomEntryReplayGate(firstRequest, "loading"),
    "ready"
  )
  assert.equal(firstReady.canReplay, true)

  const consumed = advanceRoomEntryReplayGate(firstReady, "replayed")
  assert.equal(advanceRoomEntryReplayGate(consumed, "ready").canReplay, false)

  const reopened = advanceRoomEntryReplayGate(consumed, "requested")
  const reopenedReady = advanceRoomEntryReplayGate(
    advanceRoomEntryReplayGate(reopened, "loading"),
    "ready"
  )
  assert.equal(reopenedReady.canReplay, true)
})

test("failed entry settles its replay gate so late ready cannot resurrect entry replay", () => {
  const loading = advanceRoomEntryReplayGate(
    advanceRoomEntryReplayGate(createRoomEntryReplayGate(), "requested"), "loading"
  )
  const failed = advanceRoomEntryReplayGate(loading, "failed")
  assert.equal(failed.replayed, true)
  assert.equal(advanceRoomEntryReplayGate(failed, "ready").canReplay, false)
  const reopened = advanceRoomEntryReplayGate(failed, "requested")
  assert.equal(reopened.replayed, false)
})
