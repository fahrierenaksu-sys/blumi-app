import assert from "node:assert/strict"
import test from "node:test"
import {
  presentConnectionMatch,
  type ConnectionMatchPresentationDependencies
} from "./connectionMatchPresentation"

function createDependencies(): ConnectionMatchPresentationDependencies & {
  presented: Set<string>
  analyticsEvents: string[]
  toasts: { title: string; body: string }[]
  matches: { miniRoomId: string; matchedUserName: string; matchedUserId: string }[]
} {
  const presented = new Set<string>()
  return {
    presented,
    analyticsEvents: [],
    toasts: [],
    matches: [],
    hasPresented(miniRoomId) {
      return presented.has(miniRoomId)
    },
    markPresented(miniRoomId) {
      presented.add(miniRoomId)
    },
    captureMatchCreated() {
      this.analyticsEvents.push("match_created")
    },
    showMatchToast(toast) {
      this.toasts.push(toast)
    },
    showMatchModal(match) {
      this.matches.push(match)
    }
  }
}

test("presents the full mutual-match reveal once for an HTTP-delivered match", () => {
  const dependencies = createDependencies()

  const presented = presentConnectionMatch(dependencies, {
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production"
  })

  assert.equal(presented, true)
  assert.deepEqual(dependencies.analyticsEvents, ["match_created"])
  assert.deepEqual(dependencies.toasts, [{
    title: "It's a match! ✨",
    body: "You and Bora both saved the moment"
  }])
  assert.deepEqual(dependencies.matches, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora"
  }])
})

test("does not duplicate the reveal when realtime later reports the same match", () => {
  const dependencies = createDependencies()
  const input = {
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production" as const
  }

  presentConnectionMatch(dependencies, input)
  const duplicatePresented = presentConnectionMatch(dependencies, input)

  assert.equal(duplicatePresented, false)
  assert.equal(dependencies.analyticsEvents.length, 1)
  assert.equal(dependencies.toasts.length, 1)
  assert.equal(dependencies.matches.length, 1)
})
