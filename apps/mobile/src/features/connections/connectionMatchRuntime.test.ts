import assert from "node:assert/strict"
import test from "node:test"
import { shouldHandleConnectionMatchedEvent } from "./connectionMatchRuntime"

const matchedEvent = {
  type: "connection.matched" as const,
  payload: {
    miniRoomId: "room_match",
    participantUserIds: ["ada", "bora"] as [string, string],
    matchedAt: "2026-07-22T00:00:00.000Z"
  }
}

function createState(overrides: {
  handledMatchIds?: ReadonlySet<string>
  reconcilingMatchIds?: ReadonlySet<string>
} = {}) {
  return {
    handledMatchIds: overrides.handledMatchIds ?? new Set<string>(),
    reconcilingMatchIds: overrides.reconcilingMatchIds ?? new Set<string>()
  }
}

test("accepts a match event for the current participant", () => {
  assert.equal(
    shouldHandleConnectionMatchedEvent(matchedEvent, "ada", createState()),
    true
  )
})

test("rejects match events that are not addressed to the current participant", () => {
  assert.equal(
    shouldHandleConnectionMatchedEvent(matchedEvent, "cora", createState()),
    false
  )
})

test("rejects match events before a session actor is available", () => {
  assert.equal(
    shouldHandleConnectionMatchedEvent(matchedEvent, undefined, createState()),
    false
  )
})

test("rejects a match that was already presented or is currently reconciling", () => {
  assert.equal(
    shouldHandleConnectionMatchedEvent(
      matchedEvent,
      "ada",
      createState({ handledMatchIds: new Set(["room_match"]) })
    ),
    false
  )
  assert.equal(
    shouldHandleConnectionMatchedEvent(
      matchedEvent,
      "ada",
      createState({ reconcilingMatchIds: new Set(["room_match"]) })
    ),
    false
  )
})

test("does not mutate the caller-owned deduplication state", () => {
  const handledMatchIds = new Set<string>()
  const reconcilingMatchIds = new Set<string>()

  shouldHandleConnectionMatchedEvent(matchedEvent, "ada", {
    handledMatchIds,
    reconcilingMatchIds
  })

  assert.deepEqual([...handledMatchIds], [])
  assert.deepEqual([...reconcilingMatchIds], [])
})
