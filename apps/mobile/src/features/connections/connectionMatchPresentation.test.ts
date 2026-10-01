import assert from "node:assert/strict"
import test from "node:test"
import {
  presentConnectionMatch,
  type ConnectionMatchPresentationDependencies
} from "./connectionMatchPresentation"

function createDependencies(): ConnectionMatchPresentationDependencies & {
  presented: Set<string>
  analyticsEvents: string[]
  matches: Parameters<ConnectionMatchPresentationDependencies["showMatchModal"]>[0][]
} {
  const presented = new Set<string>()
  return {
    presented,
    analyticsEvents: [],
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
  assert.deepEqual(dependencies.matches, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora"
  }])
})

test("the modal is the only celebration: no toast is shown on top of it (DSC-1)", () => {
  // The dependency contract has no toast. An English-only toast used to sit on
  // top of the modal on Turkish devices (UX audit DSC-1, 2026-10-01).
  const toasts: unknown[] = []
  const dependencies = Object.assign(createDependencies(), {
    showMatchToast: (toast: unknown) => { toasts.push(toast) }
  })
  presentConnectionMatch(dependencies, {
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production"
  })
  assert.deepEqual(toasts, [])
})

test("the modal receives the partner's real avatar when the chat provided one (DSC-3)", () => {
  const dependencies = createDependencies()
  const avatar = { presetId: "avatar_v2_body_default", revision: 2 }

  presentConnectionMatch(dependencies, {
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    matchedAvatarSelection: avatar,
    mode: "production"
  })

  assert.deepEqual(dependencies.matches, [{
    miniRoomId: "room_match",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    matchedAvatarSelection: avatar
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
  assert.equal(dependencies.matches.length, 1)
})

test("a Discover match reaching the partner shows once and leaves match_created to the swiper's decision", () => {
  const dependencies = createDependencies()
  const input = {
    miniRoomId: "match_match_42",
    matchedUserId: "bora",
    matchedUserName: "Bora",
    mode: "production" as const,
    source: "discovery" as const
  }

  assert.equal(presentConnectionMatch(dependencies, input), true)
  assert.equal(presentConnectionMatch(dependencies, input), false)
  assert.equal(dependencies.matches.length, 1)
  assert.equal(dependencies.analyticsEvents.length, 0)
})
